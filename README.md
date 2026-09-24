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

### External files

You need to get `ffmpeg.exe` and `ffprobe.exe` also.
