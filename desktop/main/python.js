"use strict";

// Everything that runs or talks to Python: short one-shot commands (device
// listing) and the long-lived live converter.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getChild, getWin, isStopping, setChild, setStopping } = require("./state");

// Force UTF-8 and unbuffered logs so lines reach the window as they are printed.
function pythonEnv() {
  return { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" };
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

// Run Python to completion and return stdout. Used for --list-devices, not the live stream.
function runPython(python, root, args, missing) {
  return new Promise((resolve, reject) => {
    const problem = missing();
    if (problem) {
      reject(new Error(problem));
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

// Send one event to the page. Ignored if the window is already gone.
function emit(channel, payload) {
  const win = getWin();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
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
    const expected = isStopping();
    setStopping(false);
    if (getChild() === proc) setChild(null);
    emit("exit", { code, expected });
  });
  proc.on("error", (error) => {
    emit("log", error.message);
  });
}

module.exports = { filesIn, pythonEnv, runPython, attachLogs, emit };
