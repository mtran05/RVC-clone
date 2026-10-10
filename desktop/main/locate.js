"use strict";

// Walk upward from the exe or this folder until the repo and its venv are found.

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { findRepo } = require("../repo");

// Resolved once, at startup, into the project root and the interpreter to use.
// `missing()` is the message to show the user when something needed is absent,
// or null when everything is in place.
function createLocator() {
  const starts = [process.env.PORTABLE_EXECUTABLE_DIR, process.env.PORTABLE_EXECUTABLE_FILE && path.dirname(process.env.PORTABLE_EXECUTABLE_FILE)];
  // Unpackaged, this file sits in desktop/main, so the app folder is one up.
  if (app.isPackaged) starts.push(path.dirname(process.execPath));
  else starts.push(path.resolve(__dirname, ".."));

  const located = findRepo(starts);
  const root = located && located.root;
  const python = process.env.RVC_PYTHON || (located && located.python);

  function missing() {
    if (!root) return "Could not find this project. Keep Overtone.exe inside the RVC Clone folder.";
    if (!python || !fs.existsSync(python)) return `Python not found: ${python || "(unset)"}`;
    return null;
  }

  return { root, python, missing };
}

module.exports = { createLocator };
