"use strict";

// Desktop window for live voice conversion.
// Locates the project and its Python, opens the window, and hands the page an
// API through preload.js. The work lives in main/.

const path = require("path");
const { app, BrowserWindow } = require("electron");
const { registerIpc } = require("./main/ipc");
const { createLocator } = require("./main/locate");
const { getChild, setWin } = require("./main/state");

const locator = createLocator();

// Open the UI. The page cannot use Node; it talks to this process through preload.js.
function createWindow() {
  const win = new BrowserWindow({
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
  setWin(win);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    setWin(null);
    const child = getChild();
    if (child) child.kill();
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "renderer", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc(locator);
  createWindow();
});

<<<<<<< HEAD
// kind is "model", "index", or "audio". Returns the chosen path, or null if cancelled.
ipcMain.handle("browse", async (_event, kind) => {
  let title = "Select File";
  let defaultPath;
  let filters = [];

  if (kind === "model") {
    title = "Voice model";
    defaultPath = root ? path.join(root, "assets", "weights") : undefined;
    filters = [{ name: "Voice model", extensions: ["pth"] }];
  } else if (kind === "index") {
    title = "Index";
    defaultPath = root ? path.join(root, "assets", "indices") : undefined;
    filters = [{ name: "Index", extensions: ["index"] }];
  } else if (kind === "audio") {
    title = "Audio file";
    filters = [
      { name: "Audio Files", extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"] }
    ];
  }

  const result = await dialog.showOpenDialog(win, {
    title,
    defaultPath,
    properties: ["openFile"],
    filters,
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
=======
>>>>>>> main
app.on("before-quit", () => {
  const child = getChild();
  if (child) child.kill();
});
<<<<<<< HEAD
app.on("window-all-closed", () => app.quit());
=======

app.on("window-all-closed", () => app.quit());
>>>>>>> main
