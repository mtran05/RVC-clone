# Overtone

Real-time voice conversion client for RVC models. Speak into your mic and hear the converted voice live, from the command line or a desktop app.

Based on [RVC WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI).

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

### Testing Real-time RVC

```bash
.venv\Scripts\python.exe -m inference.realtime --model assets/weights/kikiV1.pth --index assets/indices/kikiV1.index --live
```

To convert a file instead of the microphone, use the same command with `--input` and `--output`. That is the only file path; there is no separate offline converter.

### Python layout

```
inference/
  realtime.py       the entry point: CLI, microphone capture, file conversion
  rtrvc.py          the streaming model behind it
  device.py         picks the GPU and the precision
  opts.py           reads the shared option spec
  hubert.py         content features          rmvpe.py / fcpe.py   pitch
  cuda_graph.py     records and replays fixed-shape work
  module/           the voice network, vendored from upstream RVC
```

Two things are worth knowing before editing:

- **Importing a module has no side effects.** `device.py` chooses a GPU when you call `detect_device()`, not when you import it, and `inference/__init__.py` imports nothing so that importing the package does not pull in torch.
- **`inference/module/` and `inference/rmvpe.py` are vendored** from upstream RVC and kept as they are, so they stay easy to re-sync. Everything else is ours.

## Desktop UI

The live window uses the same options as `inference.realtime --live`. Finish the setup above first. The window does not install Python or the voice models.

`desktop` is an npm workspace: one `npm install` there installs both the Electron app and the React renderer, so there is only ever one copy of React and Vite.

```powershell
cd desktop
npm install
npm run verify      # format check, lint, typecheck, tests
npm start           # run the window from source
```

Build the portable exe (this also builds and tests the renderer):

```powershell
cd desktop
npm install
npm run pack
```

Run `desktop\dist\Overtone.exe`. Leave that file in `desktop\dist`. It looks upward for this folder and runs `.venv\Scripts\python.exe`. Put `.pth` models in `assets\weights` and `.index` files in `assets\indices`, or browse to them.

For front-end development with live reload, run the Vite dev server and point Electron at it:

```powershell
cd desktop
npm run dev                          # in one terminal
$env:VITE_DEV_SERVER_URL="http://localhost:5173"; npm start   # in another
```

### Desktop scripts

Run from `desktop`:

| Script | What it does |
| --- | --- |
| `npm run verify` | `format:check`, `lint`, `typecheck`, and `test`. Run this before committing. |
| `npm test` | Vitest across the Electron main process, the shared option spec, and the renderer. |
| `npm run lint` | ESLint over `main/`, `tests/`, and `renderer/src/`. |
| `npm run format` / `format:check` | Prettier. `format:check` is what CI and `verify` run. |
| `npm run typecheck` | `tsc --noEmit` over the renderer. |
| `npm run dev` | Vite dev server for the renderer alone, with hot reload. |
| `npm start` | Launches Electron. Set `VITE_DEV_SERVER_URL` first to use the dev server. |
| `npm run pack` | `verify`, then the renderer build, then `electron-builder` into `desktop\dist`. |

### Layout

```
desktop/
  main.js              Electron entry: app lifecycle and the window
  preload.js           the only API the page may call
  args.js              builds the CLI arguments for inference.realtime
  repo.js              finds the project folder from the exe
  main/                locating the project, running Python, the IPC handlers
  shared/
    opts-spec.json     every option: flag, default, range, label, help text
  tests/               tests for the main process
  renderer/
    src/
      components/      one .tsx and one .module.css per component
      hooks/           useLog, useDevices, useDismiss
      lib/             the bridge types, option specs, and form sanitizing
      pages/           one directory per routed page
      styles/          global.css (reset and tokens) and shared control styles
```

### Where a setting is defined

Every inference option is described once, in `desktop/shared/opts-spec.json`: its CLI flag, default, step, min and max, the desktop app's label and help text, and the terminal's help text. That one file feeds `desktop/args.js`, `inference/realtime.py`'s argument parser, and the renderer's form controls, so the three cannot disagree.

To add an option, add it there and it appears in the app's "More settings" sheet and in `python -m inference.realtime --help`. Then add it to `InferenceOpts` in `renderer/src/lib/bridge.ts` so the renderer knows its type.

### Styling

Component styles are CSS modules, one file per component, named after it. `renderer/src/styles/global.css` holds only what has no owning component: the reset, the design tokens in `:root`, and element defaults. `renderer/src/styles/controls.module.css` holds the shared look of plain inputs and selects, which components compose rather than restate.

State that used to be a class on `<body>` is now a `data-` attribute on the owning element, such as `data-status` on the shell.

### Tests

`npm test` covers the pure logic and one render smoke test. There is no DOM test suite beyond that smoke test; when you add one, prefer testing behaviour over markup.
