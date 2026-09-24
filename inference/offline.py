"""Convert a whole audio file with the offline RVC pipeline.

    python -m inference.offline --model assets/weights/kikiV1.pth --index assets/indices/kikiV1.index --input voice.wav --output converted.wav
"""

import argparse
import logging
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from configs.config import Config
from inference.hubert import load_hubert_model
from inference.pipeline import Pipeline
from inference.rtrvc import get_synthesizer


logger = logging.getLogger(__name__)


def convert_file(
    model_path,
    input_path,
    output_path,
    index_path="",
    index_rate=0.75,
    key=0,
    f0_method="rmvpe",
    protect=0.33,
    rms_mix_rate=0.25,
    output_sample_rate=0,
):
    config = Config()
    net_g, checkpoint = get_synthesizer(str(model_path), config.device)
    if config.is_half:
        net_g = net_g.half()
    target_sr = checkpoint["config"][-1]
    version = checkpoint.get("version", "v1")
    use_f0 = checkpoint.get("f0", 1)
    hubert = load_hubert_model(config.device, config.is_half)
    pipeline = Pipeline(target_sr, config)
    audio, _ = librosa.load(input_path, sr=16000, mono=True)
    audio = audio.astype(np.float32)
    resample_sr = output_sample_rate or target_sr
    times = [0.0, 0.0, 0.0]
    converted = pipeline.pipeline(
        hubert,
        net_g,
        0,
        audio,
        times,
        key,
        f0_method,
        index_path if index_rate else "",
        index_rate,
        use_f0,
        target_sr,
        resample_sr,
        rms_mix_rate,
        version,
        protect,
    )
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, converted, resample_sr)
    logger.info(
        "Wrote %s. Timing: features=%.3fs, pitch=%.3fs, model=%.3fs",
        output,
        times[0],
        times[1],
        times[2],
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description="Offline RVC voice conversion")
    parser.add_argument("--model", required=True, help="Path to a trained .pth voice model")
    parser.add_argument("--index", default="", help="Optional .index retrieval file")
    parser.add_argument("--input", required=True, help="Input audio file")
    parser.add_argument("--output", required=True, help="Output wav path")
    parser.add_argument("--key", type=int, default=0, help="Pitch shift in semitones")
    parser.add_argument("--index-rate", type=float, default=0.75)
    parser.add_argument("--f0", choices=("rmvpe", "fcpe", "pm"), default="rmvpe")
    parser.add_argument("--protect", type=float, default=0.33, help="Consonant protection, 0.5 disables it")
    parser.add_argument("--rms-mix-rate", type=float, default=0.25)
    parser.add_argument("--sample-rate", type=int, default=0, help="0 keeps the model sample rate")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if not Path(args.model).is_file():
        parser.error(f"Model not found: {args.model}")
    if not Path(args.input).is_file():
        parser.error(f"Input not found: {args.input}")
    index_rate = args.index_rate if args.index else 0.0
    if args.index and not Path(args.index).is_file():
        parser.error(f"Index not found: {args.index}")
    convert_file(
        args.model,
        args.input,
        args.output,
        index_path=args.index,
        index_rate=index_rate,
        key=args.key,
        f0_method=args.f0,
        protect=args.protect,
        rms_mix_rate=args.rms_mix_rate,
        output_sample_rate=args.sample_rate,
    )


if __name__ == "__main__":
    main()
