"use strict";

// The five IPC handlers the page can call. Their names and payloads are the
// contract described by RvcBridge in renderer/src/lib/bridge.ts; changing one
// side without the other will fail the preload shape test in desktop/tests.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { dialog, ipcMain } = require("electron");
const { buildArgs, parseDevices } = require("../args");
const { attachLogs, filesIn, pythonEnv, runPython } = require("./python");
const { getChild, getWin, setChild, setStopping } = require("./state");

const AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"];
const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function registerIpc(locator) {
  const { root, python, missing } = locator;

  // Models live in assets/weights, index files in assets/indices, sounds in assets/sounds.
  ipcMain.handle("assets", () => {
    if (!root) return { models: [], indices: [], sounds: [] };
    return {
      models: filesIn(path.join(root, "assets", "weights"), ".pth"),
      indices: filesIn(path.join(root, "assets", "indices"), ".index"),
      sounds: filesIn(path.join(root, "assets", "sounds"), AUDIO_EXTS),
    };
  });

  // kind is "model", "index", "audio", or "image". Returns the chosen path (or data URL for image), or null if cancelled.
  ipcMain.handle("browse", async (_event, kind) => {
    const picker =
      kind === "model"
        ? {
            title: "Voice model",
            defaultPath: root ? path.join(root, "assets", "weights") : undefined,
            filters: [{ name: "Voice model", extensions: ["pth"] }],
          }
        : kind === "index"
          ? {
              title: "Index",
              defaultPath: root ? path.join(root, "assets", "indices") : undefined,
              filters: [{ name: "Index", extensions: ["index"] }],
            }
          : kind === "audio"
            ? {
                title: "Audio clip",
                defaultPath: root ? path.join(root, "assets", "sounds") : undefined,
                filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"] }],
              }
            : {
                title: "Profile image",
                filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }],
              };

    const result = await dialog.showOpenDialog(getWin(), {
      ...picker,
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const chosen = result.filePaths[0];
    if (kind === "image") {
      try {
        const ext = path.extname(chosen).toLowerCase();
        const mime = IMAGE_MIME[ext] || "image/png";
        const data = fs.readFileSync(chosen);
        return `data:${mime};base64,${data.toString("base64")}`;
      } catch {
        return null;
      }
    }
    return chosen;
  });

  // Ask Python for the PortAudio device table and parse it for the two dropdowns.
  ipcMain.handle("devices", async () => {
    try {
      const text = await runPython(python, root, ["-m", "inference.realtime", "--list-devices"], missing);
      return { ok: true, devices: parseDevices(text) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Start one live converter. Options are fixed for that process; the page locks them.
  ipcMain.handle("start", (_event, opts) => {
    if (getChild()) return { ok: false, error: "Already running" };
    const problem = missing();
    if (problem) return { ok: false, error: problem };
    let args;
    try {
      args = buildArgs(opts);
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (!fs.existsSync(opts.model)) return { ok: false, error: `Model not found: ${opts.model}` };
    if (opts.index && !fs.existsSync(opts.index)) return { ok: false, error: `Index not found: ${opts.index}` };
    setStopping(false);
    const child = spawn(python, args, { cwd: root, windowsHide: true, env: pythonEnv() });
    setChild(child);
    attachLogs(child);
    return { ok: true };
  });

  // Kill the live process. stopping marks the exit as expected so the page stays Idle.
  ipcMain.handle("stop", () => {
    const child = getChild();
    if (!child) return { ok: true };
    setStopping(true);
    child.kill();
    return { ok: true };
  });
}

module.exports = { registerIpc };
