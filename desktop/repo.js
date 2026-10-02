"use strict";

// Find the RVC project folder from the desktop app, a portable exe, or a parent directory.
// A hit is a folder that contains both .venv\Scripts\python.exe and inference\realtime.py.

const fs = require("fs");
const path = require("path");

// ponytail: walks 8 parents from the exe. Move the project higher if a deeper nest stops the search.
function findRepo(starts, exists = fs.existsSync) {
  const seen = new Set();
  for (const start of starts) {
    if (!start) continue;
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (seen.has(dir)) break;
      seen.add(dir);
      const python = path.join(dir, ".venv", "Scripts", "python.exe");
      const entry = path.join(dir, "inference", "realtime.py");
      if (exists(python) && exists(entry)) return { root: dir, python };
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function check(cond, message) {
  if (!cond) throw new Error(message);
}

if (require.main === module) {
  const root = path.resolve("/proj");
  const python = path.join(root, ".venv", "Scripts", "python.exe");
  const entry = path.join(root, "inference", "realtime.py");
  const hit = new Set([python, entry]);
  const found = findRepo([path.join(root, "desktop", "dist")], (file) => hit.has(file));
  check(found && found.root === root && found.python === python, "exe folder should find the project");
  check(findRepo([path.join(root, "desktop", "dist")], () => false) === null, "missing project should fail");
  console.log("repo ok");
}

module.exports = { findRepo };
