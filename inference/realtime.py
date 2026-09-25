"""Run real-time voice conversion from a file or the microphone.

File mode writes a converted wav using the same block, overlap, and SOLA
crossfade path as live playback:

    python -m inference.realtime --model assets/weights/kikiV1.pth --index assets/indices/kikiV1.index --input voice.wav --output converted.wav

Live mode plays the microphone through the default speakers:

    python -m inference.realtime --model assets/weights/kikiV1.pth --index assets/indices/kikiV1.index --live
"""

import argparse
import logging
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F
from torchaudio.transforms import Resample

from configs.config import infer_device, infer_dtype
from inference.rtrvc import RVC


logger = logging.getLogger(__name__)


class DeviceConfig:
    """The two fields RVC reads from a config object."""

    def __init__(self, device, is_half):
        """Store the inference device and whether the model runs in float16."""
        self.device = device
        self.is_half = is_half


class RealtimeConverter:
    """Stream fixed-size blocks through the real-time RVC model."""

    def __init__(
        self,
        model_path,
        index_path,
        index_rate,
        key,
        formant,
        f0_method,
        sample_rate,
        block_time=0.25,
        crossfade_time=0.05,
        extra_time=2.5,
        rms_mix_rate=0.0,
    ):
        """Load the voice model and size the overlap buffers from the block settings."""
        self.f0_method = f0_method
        self.rms_mix_rate = rms_mix_rate
        self.device = infer_device
        self.config = DeviceConfig(self.device, infer_dtype == torch.float16)
        self.rvc = RVC(
            key,
            formant,
            str(model_path),
            str(index_path) if index_path else "",
            index_rate,
            self.config,
        )
        self.sample_rate = int(sample_rate or self.rvc.tgt_sr)
        # zc is 10 ms. Every block length is a multiple of that so pitch frames line up.
        self.zc = self.sample_rate // 100
        self.block_frame = int(np.round(block_time * self.sample_rate / self.zc)) * self.zc
        self.block_frame_16k = 160 * self.block_frame // self.zc
        crossfade_frame = int(np.round(crossfade_time * self.sample_rate / self.zc)) * self.zc
        self.sola_buffer_frame = min(crossfade_frame, 4 * self.zc)
        self.sola_search_frame = self.zc
        self.extra_frame = int(np.round(extra_time * self.sample_rate / self.zc)) * self.zc
        self.skip_head = self.extra_frame // self.zc
        self.return_length = (
            self.block_frame + self.sola_buffer_frame + self.sola_search_frame
        ) // self.zc

        buffer_frames = (
            self.extra_frame
            + self.sola_buffer_frame
            + self.sola_search_frame
            + self.block_frame
        )
        self.input_wav = torch.zeros(buffer_frames, device=self.device, dtype=torch.float32)
        self.input_wav_res = torch.zeros(
            160 * buffer_frames // self.zc, device=self.device, dtype=torch.float32
        )
        self.sola_buffer = torch.zeros(
            self.sola_buffer_frame, device=self.device, dtype=torch.float32
        )
        self.fade_in_window = (
            torch.sin(
                0.5
                * np.pi
                * torch.linspace(
                    0.0,
                    1.0,
                    steps=self.sola_buffer_frame,
                    device=self.device,
                    dtype=torch.float32,
                )
            )
            ** 2
        )
        self.fade_out_window = 1 - self.fade_in_window
        self.resampler = Resample(
            orig_freq=self.sample_rate, new_freq=16000, dtype=torch.float32
        ).to(self.device)
        if self.rvc.tgt_sr != self.sample_rate:
            self.output_resampler = Resample(
                orig_freq=self.rvc.tgt_sr, new_freq=self.sample_rate, dtype=torch.float32
            ).to(self.device)
        else:
            self.output_resampler = None
        logger.info(
            "Real-time converter ready: model=%s, %d Hz, block=%d samples, device=%s",
            model_path,
            self.sample_rate,
            self.block_frame,
            self.device,
        )

    def process_block(self, block):
        """Convert one block and crossfade it onto the previous block."""
        block = np.asarray(block, dtype=np.float32).reshape(-1)
        if block.shape[0] != self.block_frame:
            raise ValueError(
                f"Expected {self.block_frame} samples, received {block.shape[0]}"
            )
        # Keep extra context in front of the new block, then resample that tail to 16 kHz.
        self.input_wav[: -self.block_frame] = self.input_wav[self.block_frame :].clone()
        self.input_wav[-self.block_frame :] = torch.from_numpy(block).to(self.device)
        self.input_wav_res[: -self.block_frame_16k] = self.input_wav_res[
            self.block_frame_16k :
        ].clone()
        resampled = self.resampler(self.input_wav[-self.block_frame - 2 * self.zc :])
        self.input_wav_res[-self.block_frame_16k - 160 :] = resampled[160:]

        inferred = self.rvc.infer(
            self.input_wav_res,
            self.block_frame_16k,
            self.skip_head,
            self.return_length,
            self.f0_method,
        )
        if self.output_resampler is not None:
            inferred = self.output_resampler(inferred)
        if self.rms_mix_rate < 1:
            inferred = self._mix_volume_envelope(inferred)

        # SOLA slides the new audio until it best matches the previous tail, then crossfades.
        window = self.sola_buffer_frame + self.sola_search_frame
        conv_input = inferred[None, None, :window]
        correlation = F.conv1d(conv_input, self.sola_buffer[None, None, :])
        energy = torch.sqrt(
            F.conv1d(
                conv_input**2,
                torch.ones(1, 1, self.sola_buffer_frame, device=self.device),
            )
            + 1e-8
        )
        sola_offset = int(torch.argmax(correlation[0, 0] / energy[0, 0]).item())
        inferred = inferred[sola_offset:]
        inferred[: self.sola_buffer_frame] *= self.fade_in_window
        inferred[: self.sola_buffer_frame] += self.sola_buffer * self.fade_out_window
        self.sola_buffer[:] = inferred[
            self.block_frame : self.block_frame + self.sola_buffer_frame
        ]
        return inferred[: self.block_frame].detach().cpu().numpy()

    def _mix_volume_envelope(self, inferred):
        """Pull the converted loudness toward the input block's envelope."""
        source = self.input_wav[self.extra_frame :]
        source = source[: inferred.shape[0]].detach().cpu().numpy()
        frame_length = 4 * self.zc
        rms_source = _rms_envelope(source, frame_length, self.zc, inferred.shape[0])
        rms_output = _rms_envelope(
            inferred.detach().cpu().numpy(), frame_length, self.zc, inferred.shape[0]
        )
        rms_source = torch.from_numpy(rms_source).to(self.device)
        rms_output = torch.from_numpy(rms_output).to(self.device)
        rms_output = torch.clamp(rms_output, min=1e-3)
        return inferred * torch.pow(rms_source / rms_output, 1 - self.rms_mix_rate)

    def convert(self, audio, sample_rate):
        """Convert a whole array by the same block path used for live audio."""
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        if sample_rate != self.sample_rate:
            audio = (
                Resample(orig_freq=sample_rate, new_freq=self.sample_rate)(
                    torch.from_numpy(audio)
                )
                .numpy()
            )
        original_length = len(audio)
        padding = (-original_length) % self.block_frame
        if padding:
            audio = np.pad(audio, (0, padding))
        blocks = []
        for start in range(0, len(audio), self.block_frame):
            blocks.append(self.process_block(audio[start : start + self.block_frame]))
        converted = np.concatenate(blocks)[:original_length]
        peak = np.max(np.abs(converted))
        if peak > 0.99:
            converted = converted / peak * 0.99
        return converted


def _rms_envelope(audio, frame_length, hop_length, size):
    """Return a per-sample RMS envelope aligned to audio."""
    import librosa

    rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)
    envelope = torch.from_numpy(rms)
    envelope = F.interpolate(
        envelope.unsqueeze(0), size=size + 1, mode="linear", align_corners=True
    )[0, 0, :-1]
    return envelope.numpy()


def _load_audio(path):
    """Read a file as mono float32 and return it with its sample rate."""
    audio, sample_rate = sf.read(path, always_2d=False)
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 2:
        audio = audio.mean(axis=1)
    return audio, sample_rate


def _build_converter(args):
    """Build a RealtimeConverter from parsed CLI arguments."""
    index_rate = args.index_rate if args.index else 0.0
    return RealtimeConverter(
        model_path=args.model,
        index_path=args.index,
        index_rate=index_rate,
        key=args.key,
        formant=args.formant,
        f0_method=args.f0,
        sample_rate=args.sample_rate,
        block_time=args.block_time,
        crossfade_time=args.crossfade_time,
        extra_time=args.extra_time,
        rms_mix_rate=args.rms_mix_rate,
    )


def _convert_file(args):
    """Convert --input and write --output."""
    converter = _build_converter(args)
    _apply_runtime_limits(converter, args)
    audio, sample_rate = _load_audio(args.input)
    if args.input_gain != 1.0:
        audio = audio * args.input_gain
    converted = converter.convert(audio, sample_rate) * args.output_gain
    if not args.no_clip:
        converted = np.clip(converted, -1.0, 1.0)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, converted, converter.sample_rate, subtype=args.subtype)
    logger.info("Wrote %s (%d samples at %d Hz)", output, len(converted), converter.sample_rate)


def _run_live(args):
    """Convert the chosen microphone and play it on the chosen speakers."""
    sd = _import_sounddevice()
    input_device = _resolve_device(args.input_device, "input", args.host_api)
    output_device = _resolve_device(args.output_device, "output", args.host_api)
    extra_settings = _wasapi_settings(sd, args, input_device, output_device)
    converter = _build_converter(args)
    _apply_runtime_limits(converter, args)
    input_device_info = sd.query_devices(
        input_device if input_device is not None else sd.default.device[0]
    )
    if args.input_channels > input_device_info["max_input_channels"]:
        raise SystemExit(
            f"Input device has {input_device_info['max_input_channels']} channels, "
            f"not {args.input_channels}"
        )
    output_device_info = sd.query_devices(
        output_device if output_device is not None else sd.default.device[1]
    )
    if args.output_channels > output_device_info["max_output_channels"]:
        raise SystemExit(
            f"Output device has {output_device_info['max_output_channels']} channels, "
            f"not {args.output_channels}"
        )

    def callback(indata, outdata, frames, time_info, status):
        """Convert one microphone block and copy it into the speaker buffer."""
        if status:
            logger.warning("Audio stream: %s", status)
        mono = np.mean(indata, axis=1) if indata.ndim == 2 else indata
        mono = mono * args.input_gain
        converted = converter.process_block(mono) * args.output_gain
        if not args.no_clip:
            converted = np.clip(converted, -1.0, 1.0)
        if outdata.shape[1] == 1:
            outdata[:, 0] = converted
        else:
            outdata[:] = converted[:, None]

    logger.info(
        "Input %s, output %s. Press Ctrl+C to stop. Block size is %d samples.",
        _device_label(sd, input_device, "input"),
        _device_label(sd, output_device, "output"),
        converter.block_frame,
    )
    with sd.Stream(
        device=(input_device, output_device),
        samplerate=converter.sample_rate,
        blocksize=converter.block_frame,
        channels=(args.input_channels, args.output_channels),
        dtype="float32",
        latency=_parse_latency(args.latency),
        extra_settings=extra_settings,
        callback=callback,
    ):
        try:
            while True:
                sd.sleep(1000)
        except KeyboardInterrupt:
            logger.info("Stopped")


def _import_sounddevice():
    """Import PortAudio. The live path is the only caller, so file mode stays light."""
    import sounddevice as sd

    return sd


def _host_api_name(sd, device):
    """Return the PortAudio host name for one device entry."""
    return sd.query_hostapis(device["hostapi"])["name"]


def _device_matches(sd, index, device, kind, host_api):
    """Return whether this device can be used as an input or an output."""
    channel_key = "max_input_channels" if kind == "input" else "max_output_channels"
    if device[channel_key] < 1:
        return False
    if host_api and host_api.lower() not in _host_api_name(sd, device).lower():
        return False
    return True


def _resolve_device(spec, kind, host_api=None):
    """Return a PortAudio device index, or None to keep the system default.

    spec may be a device number from --list-devices or part of the device name.
    """
    if spec is None or spec == "":
        return None
    sd = _import_sounddevice()
    devices = sd.query_devices()
    try:
        index = int(spec)
    except ValueError:
        index = None
    if index is not None:
        if index < 0 or index >= len(devices):
            raise SystemExit(f"{kind} device {index} is outside 0..{len(devices) - 1}")
        device = devices[index]
        if not _device_matches(sd, index, device, kind, host_api):
            raise SystemExit(
                f"Device {index} ({device['name']}) is not a matching {kind} device"
            )
        return index
    needle = str(spec).lower()
    matches = [
        i
        for i, device in enumerate(devices)
        if needle in device["name"].lower() and _device_matches(sd, i, device, kind, host_api)
    ]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise SystemExit(f"No {kind} device matches {spec!r}. Run --list-devices.")
    names = ", ".join(f"{i}: {devices[i]['name']}" for i in matches)
    raise SystemExit(f"Several {kind} devices match {spec!r}: {names}")


def _device_label(sd, index, kind):
    """Describe the device that will actually be opened."""
    if index is None:
        index = sd.default.device[0 if kind == "input" else 1]
    device = sd.query_devices(index)
    return f"{index}: {device['name']} ({_host_api_name(sd, device)})"


def _parse_latency(value):
    """Accept low, high, or a number of seconds."""
    if value is None:
        return None
    if value.lower() in {"low", "high"}:
        return value.lower()
    try:
        return float(value)
    except ValueError:
        raise SystemExit("--latency must be low, high, or a number of seconds")


def _wasapi_settings(sd, args, input_device, output_device):
    """Build WASAPI settings only when the user asked for them."""
    if not args.wasapi_exclusive and not args.wasapi_auto_convert:
        return None

    def is_wasapi(index, kind):
        if index is None:
            index = sd.default.device[0 if kind == "input" else 1]
        return "WASAPI" in _host_api_name(sd, sd.query_devices(index)).upper()

    if not (is_wasapi(input_device, "input") and is_wasapi(output_device, "output")):
        raise SystemExit("--wasapi-exclusive and --wasapi-auto-convert require WASAPI devices")
    return sd.WasapiSettings(
        exclusive=args.wasapi_exclusive,
        auto_convert=args.wasapi_auto_convert,
    )


def _apply_runtime_limits(converter, args):
    """Copy pitch and index knobs onto the loaded model."""
    rvc = converter.rvc
    rvc.f0_min = args.f0_min
    rvc.f0_max = args.f0_max
    rvc.f0_mel_min = 1127 * np.log(1 + rvc.f0_min / 700)
    rvc.f0_mel_max = 1127 * np.log(1 + rvc.f0_max / 700)
    rvc.rmvpe_threshold = args.rmvpe_threshold
    rvc.fcpe_threshold = args.fcpe_threshold
    rvc.index_neighbors = args.index_neighbors


def _list_devices():
    """Print the input and output devices PortAudio can see."""
    sd = _import_sounddevice()
    default_input, default_output = sd.default.device
    print(f"{'idx':>4}  {'in':>3}  {'out':>3}  {'rate':>8}  {'host':<18}  name")
    for index, device in enumerate(sd.query_devices()):
        marks = []
        if index == default_input:
            marks.append("default input")
        if index == default_output:
            marks.append("default output")
        suffix = f"  ({', '.join(marks)})" if marks else ""
        print(
            f"{index:4d}  {device['max_input_channels']:3d}  "
            f"{device['max_output_channels']:3d}  {device['default_samplerate']:8.0f}  "
            f"{_host_api_name(sd, device):<18}  {device['name']}{suffix}"
        )


def main(argv=None):
    """Parse the real-time CLI and run file mode, live mode, or device listing."""
    parser = argparse.ArgumentParser(description="Real-time RVC voice conversion")
    parser.add_argument("--model", help="Path to a trained .pth voice model")
    parser.add_argument("--index", help="Optional .index retrieval file")
    parser.add_argument("--input", help="Input wav/flac/ogg file")
    parser.add_argument("--output", help="Output wav path for file mode")
    parser.add_argument("--live", action="store_true", help="Convert the microphone live")
    parser.add_argument("--list-devices", action="store_true", help="Print audio devices and exit")
    parser.add_argument("--key", type=int, default=0, help="Pitch shift in semitones")
    parser.add_argument("--formant", type=float, default=0.0, help="Formant shift in semitones")
    parser.add_argument("--index-rate", type=float, default=0.75, help="Index blend from 0 to 1")
    parser.add_argument("--f0", choices=("rmvpe", "fcpe", "pm"), default="rmvpe")
    parser.add_argument("--sample-rate", type=int, default=0, help="0 uses the model sample rate")
    parser.add_argument("--block-time", type=float, default=0.25, help="Block size in seconds")
    parser.add_argument("--crossfade-time", type=float, default=0.05)
    parser.add_argument("--extra-time", type=float, default=2.5, help="Context kept before each block")
    parser.add_argument("--rms-mix-rate", type=float, default=0.0, help="1 keeps the converted loudness")
    parser.add_argument("--input-device", help="Microphone number or name. Default is the system input")
    parser.add_argument("--output-device", help="Speaker number or name. Default is the system output")
    parser.add_argument("--host-api", help="Only match devices on this PortAudio host, such as WASAPI")
    parser.add_argument("--input-channels", type=int, default=1, help="Microphone channels to open, then mix to mono")
    parser.add_argument("--output-channels", type=int, default=2, help="Speaker channels. Mono audio is copied to each")
    parser.add_argument("--latency", help="low, high, or seconds. Default lets PortAudio choose")
    parser.add_argument("--input-gain", type=float, default=1.0, help="Multiply the microphone or file before conversion")
    parser.add_argument("--output-gain", type=float, default=1.0, help="Multiply the converted audio")
    parser.add_argument("--no-clip", action="store_true", help="Leave samples outside -1..1 instead of clipping")
    parser.add_argument("--wasapi-exclusive", action="store_true", help="Open WASAPI devices in exclusive mode")
    parser.add_argument("--wasapi-auto-convert", action="store_true", help="Let WASAPI resample if the rate differs")
    parser.add_argument("--f0-min", type=float, default=50.0, help="Lowest pitch treated as voiced, in Hz")
    parser.add_argument("--f0-max", type=float, default=1100.0, help="Highest pitch, in Hz")
    parser.add_argument("--rmvpe-threshold", type=float, default=0.03, help="RMVPE voicing threshold")
    parser.add_argument("--fcpe-threshold", type=float, default=0.006, help="FCPE voicing threshold")
    parser.add_argument("--index-neighbors", type=int, default=8, help="How many index vectors to blend")
    parser.add_argument(
        "--subtype",
        default="FLOAT",
        choices=("FLOAT", "PCM_16", "PCM_24", "PCM_32"),
        help="Wav sample format for file mode",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.list_devices:
        _list_devices()
        return
    if not args.model:
        parser.error("--model is required")
    if not Path(args.model).is_file():
        parser.error(f"Model not found: {args.model}")
    if args.index and not Path(args.index).is_file():
        parser.error(f"Index not found: {args.index}")
    if args.f0_min <= 0 or args.f0_max <= args.f0_min:
        parser.error("--f0-min must be positive and lower than --f0-max")
    if args.input_channels < 1 or args.output_channels < 1:
        parser.error("Channel counts must be at least 1")
    if args.index_neighbors < 1:
        parser.error("--index-neighbors must be at least 1")
    if args.live:
        _run_live(args)
        return
    if not args.input or not args.output:
        parser.error("File mode requires --input and --output. Use --live for the microphone.")
    if not Path(args.input).is_file():
        parser.error(f"Input not found: {args.input}")
    _convert_file(args)


if __name__ == "__main__":
    main()
