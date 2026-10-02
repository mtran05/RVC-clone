"use strict";

// The only API the page may call. Names match the ipc handlers in main.js.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rvc", {
  assets: () => ipcRenderer.invoke("assets"),
  browse: (kind) => ipcRenderer.invoke("browse", kind),
  devices: () => ipcRenderer.invoke("devices"),
  start: (opts) => ipcRenderer.invoke("start", opts),
  stop: () => ipcRenderer.invoke("stop"),
  onLog: (callback) => ipcRenderer.on("log", (_event, line) => callback(line)),
  onExit: (callback) => ipcRenderer.on("exit", (_event, info) => callback(info)),
});
