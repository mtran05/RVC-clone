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

app.on("before-quit", () => {
  const child = getChild();
  if (child) child.kill();
});

app.on("window-all-closed", () => app.quit());
