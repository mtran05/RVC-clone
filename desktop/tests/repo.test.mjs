// Ported from the self-check block that used to live at the bottom of repo.js.
// This file is ESM because Vitest is ESM; the module under test is CommonJS and
// arrives through Node's default-interop.

import { describe, expect, it } from "vitest";
import path from "node:path";
import { createRequire } from "node:module";

// Node's own loader, not Vite's: repo.js is CommonJS.
const require = createRequire(import.meta.url);
const { findRepo } = require("../repo.js");

const ROOT = path.resolve("/proj");
const PYTHON = path.join(ROOT, ".venv", "Scripts", "python.exe");
const ENTRY = path.join(ROOT, "inference", "realtime.py");
const EXE_DIR = path.join(ROOT, "desktop", "dist");

// A predicate that says "only these two paths exist".
const onlyProject = (file) => file === PYTHON || file === ENTRY;

describe("findRepo", () => {
  it("finds the project from a nested folder", () => {
    expect(findRepo([EXE_DIR], onlyProject)).toEqual({ root: ROOT, python: PYTHON });
  });

  it("returns null when neither marker exists", () => {
    expect(findRepo([EXE_DIR], () => false)).toBeNull();
  });

  it("ignores empty and missing start paths", () => {
    expect(findRepo([], onlyProject)).toBeNull();
    expect(findRepo([null, undefined, ""], onlyProject)).toBeNull();
  });

  it("needs both markers, not just one", () => {
    const pythonOnly = (file) => file === PYTHON;
    expect(findRepo([EXE_DIR], pythonOnly)).toBeNull();
  });

  it("gives up rather than looping forever at the drive root", () => {
    expect(findRepo(["Z:\\not-a-real-root"], onlyProject)).toBeNull();
  });

  it("still finds the project when two start paths overlap", () => {
    expect(findRepo([EXE_DIR, path.join(ROOT, "desktop")], onlyProject)).toEqual({ root: ROOT, python: PYTHON });
  });
});
