# RVC-clone

RVC clone with improvement (maybe)

Inspired by [RVC WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)

## Setup

### Windows Virtual Environment

Install Python 3.12 x64, then

```powershell
python -m venv .venv
.venv\Scripts\activate
```

### Install package requirements (NVIDIA RTX 50 series)

```bash
python -m pip install torch==2.7.1+cu128 torchaudio==2.7.1+cu128 --index-url https://download.pytorch.org/whl/cu128 --extra-index-url https://pypi.org/simple
python -m pip install -r requirements.txt
```

### Download models

```bash
python -m pip install --upgrade huggingface_hub

# Required for inference and feature extraction
hf download lj1995/VoiceConversionWebUI --revision main --include "hubert_base/*" --local-dir assets
hf download lj1995/VoiceConversionWebUI rmvpe.pt --revision main --local-dir assets/rmvpe

# Required only for pymss/MSST vocal separation
hf download lj1995/VoiceConversionWebUI --revision main --include "pymss_weights/*" --local-dir assets
```

### FFmpeg

On Windows, place these files in the repository root:

- [ffmpeg.exe](https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/ffmpeg.exe?download=true)
- [ffprobe.exe](https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/ffprobe.exe?download=true)

### Testing Real-time RVC

```bash
.venv\Scripts\python.exe -m inference.realtime --model assets/weights/kikiV1.pth --index assets/indices/kikiV1.index --live
```
