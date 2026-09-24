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
    audio, sample_rate = _load_audio(args.input)
    converted = converter.convert(audio, sample_rate)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, converted, converter.sample_rate)
    logger.info("Wrote %s (%d samples at %d Hz)", output, len(converted), converter.sample_rate)


def _run_live(args):
    """Convert the default microphone and play it on the default speakers."""
    import sounddevice as sd

    converter = _build_converter(args)

    def callback(indata, outdata, frames, time_info, status):
        """Convert one microphone block and copy it into the speaker buffer."""
        if status:
            logger.warning("Audio stream: %s", status)
        mono = np.mean(indata, axis=1) if indata.ndim == 2 else indata
        converted = converter.process_block(mono)
        if outdata.shape[1] == 1:
            outdata[:, 0] = converted
        else:
            outdata[:] = converted[:, None]

    logger.info(
        "Listening on the default microphone. Press Ctrl+C to stop. Block size is %d samples.",
        converter.block_frame,
    )
    with sd.Stream(
        samplerate=converter.sample_rate,
        blocksize=converter.block_frame,
        channels=1,
        dtype="float32",
        callback=callback,
    ):
        try:
            while True:
                sd.sleep(1000)
        except KeyboardInterrupt:
            logger.info("Stopped")


def _list_devices():
    """Print the input and output devices PortAudio can see."""
    import sounddevice as sd

    print(sd.query_devices())


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
