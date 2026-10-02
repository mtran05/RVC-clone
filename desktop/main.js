"use strict";

// Desktop window for live voice conversion.
// Locates the project and its Python, then launches inference/realtime.py.

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { buildArgs, parseDevices } = require("./args");
const { findRepo } = require("./repo");

// Walk upward from the exe or this folder until the repo and its venv are found.
function locate() {
  const starts = [
    process.env.PORTABLE_EXECUTABLE_DIR,
    process.env.PORTABLE_EXECUTABLE_FILE && path.dirname(process.env.PORTABLE_EXECUTABLE_FILE),
  ];
  if (app.isPackaged) starts.push(path.dirname(process.execPath));
  else starts.push(__dirname);
  return findRepo(starts);
}

const located = locate();
const root = located && located.root;
const python = process.env.RVC_PYTHON || (located && located.python);

// Message shown in the window when the project or Python cannot be started.
function missingPython() {
  if (!root) return "Could not find this project. Keep Overtone.exe inside the RVC Clone folder.";
  if (!python || !fs.existsSync(python)) return `Python not found: ${python || "(unset)"}`;
  return null;
}

let win = null;
let child = null;
let stopping = false;

// Send one event to the page. Ignored if the window is already gone.
function emit(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Sorted full paths of files in dir that end with ext. Empty when the folder is missing.
function filesIn(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(ext))
    .map((name) => path.join(dir, name))
    .sort();
}

// Force UTF-8 and unbuffered logs so lines reach the window as they are printed.
function pythonEnv() {
  return { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" };
}

// Run Python to completion and return stdout. Used for --list-devices, not the live stream.
function runPython(args) {
  return new Promise((resolve, reject) => {
    const missing = missingPython();
    if (missing) {
      reject(new Error(missing));
      return;
    }
    const proc = spawn(python, args, { cwd: root, windowsHide: true, env: pythonEnv() });
    let out = "";
    let err = "";
    proc.stdout.on("data", (chunk) => {
      out += chunk;
    });
    proc.stderr.on("data", (chunk) => {
      err += chunk;
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error((err || out).trim() || `Python exited ${code}`));
    });
  });
}

// Forward the live process stdout and stderr to the page, one line at a time.
// `expected` is true when the user pressed Stop, so a normal exit is not an error.
function attachLogs(proc) {
  let buffer = "";
  const onData = (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) if (line) emit("log", line);
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.on("exit", (code) => {
    if (buffer.trim()) emit("log", buffer.trim());
    buffer = "";
    const expected = stopping;
    stopping = false;
    if (child === proc) child = null;
    emit("exit", { code, expected });
  });
  proc.on("error", (error) => {
    emit("log", error.message);
  });
}

// Open the UI. The page cannot use Node; it talks to this process through preload.js.
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#12181c",
    autoHideMenuBar: true,
    title: "Overtone",
    icon: path.join(__dirname, "logo.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    win = null;
    if (child) child.kill();
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

// Models live in assets/weights, index files in assets/indices.
ipcMain.handle("assets", () => {
  if (!root) return { models: [], indices: [] };
  return {
    models: filesIn(path.join(root, "assets", "weights"), ".pth"),
    indices: filesIn(path.join(root, "assets", "indices"), ".index"),
  };
});

// kind is "model" or "index". Returns the chosen path, or null if cancelled.
ipcMain.handle("browse", async (_event, kind) => {
  const model = kind === "model";
  const result = await dialog.showOpenDialog(win, {
    title: model ? "Voice model" : "Index",
    defaultPath: root ? path.join(root, "assets", model ? "weights" : "indices") : undefined,
    properties: ["openFile"],
    filters: model
      ? [{ name: "Voice model", extensions: ["pth"] }]
      : [{ name: "Index", extensions: ["index"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

// Ask Python for the PortAudio device table and parse it for the two dropdowns.
ipcMain.handle("devices", async () => {
  try {
    const text = await runPython(["-m", "inference.realtime", "--list-devices"]);
    return { ok: true, devices: parseDevices(text) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// Start one live converter. Options are fixed for that process; the page locks them.
ipcMain.handle("start", (_event, opts) => {
  if (child) return { ok: false, error: "Already running" };
  const missing = missingPython();
  if (missing) return { ok: false, error: missing };
  let args;
  try {
    args = buildArgs(opts);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!fs.existsSync(opts.model)) return { ok: false, error: `Model not found: ${opts.model}` };
  if (opts.index && !fs.existsSync(opts.index)) return { ok: false, error: `Index not found: ${opts.index}` };
  stopping = false;
  child = spawn(python, args, { cwd: root, windowsHide: true, env: pythonEnv() });
  attachLogs(child);
  return { ok: true };
});

// Kill the live process. stopping marks the exit as expected so the page stays Idle.
ipcMain.handle("stop", () => {
  if (!child) return { ok: true };
  stopping = true;
  child.kill();
  return { ok: true };
});

app.whenReady().then(createWindow);
app.on("before-quit", () => {
  if (child) child.kill();
});
app.on("window-all-closed", () => app.quit());
