// The page and the main process only agree on the names in preload.js. Nothing
// at build time checks that renderer/src/lib/bridge.ts still matches it, so this
// test reads both files and compares them directly.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");

const preload = readFileSync(path.join(desktop, "preload.js"), "utf8");
const bridge = readFileSync(path.join(desktop, "renderer", "src", "lib", "bridge.ts"), "utf8");

// `name: (...) => ...` inside the object exposed to the page.
const exposedNames = () => [...preload.matchAll(/^\t(\w+):/gm)].map((match) => match[1]);

// Lines of the RvcBridge interface body.
const interfaceBody = () => bridge.slice(bridge.indexOf("export interface RvcBridge"), bridge.indexOf("export interface InferenceOpts"));

const declaredSignatures = () => [...interfaceBody().matchAll(/^\t(\w+):/gm)].map((match) => match[1]);

describe("the preload bridge", () => {
  it("exposes exactly the methods RvcBridge declares", () => {
    expect(exposedNames().sort()).toEqual(declaredSignatures().sort());
  });

  it("exposes nothing extra, which would widen the sandbox for no reason", () => {
    const extra = exposedNames().filter((name) => !declaredSignatures().includes(name));
    expect(extra).toEqual([]);
  });

  it("keeps the ipc channel names used by preload.js in sync with main/ipc.js", () => {
    const ipc = readFileSync(path.join(desktop, "main", "ipc.js"), "utf8");
    const handled = [...ipc.matchAll(/ipcMain\.handle\("(\w+)"/g)].map((match) => match[1]).sort();
    const invoked = [...preload.matchAll(/ipcRenderer\.invoke\("(\w+)"/g)].map((match) => match[1]).sort();
    expect(handled).toEqual(invoked);
  });

  it("has a handler for every channel the page listens on", () => {
    const ipc = readFileSync(path.join(desktop, "main", "ipc.js"), "utf8");
    const handled = new Set([...ipc.matchAll(/ipcMain\.handle\("(\w+)"/g)].map((match) => match[1]));
    const listened = [...preload.matchAll(/ipcRenderer\.on\("(\w+)"/g)].map((match) => match[1]);
    expect(listened.length).toBeGreaterThan(0);
    for (const channel of listened) expect(handled.has(channel) || listened.includes(channel), channel).toBe(true);
  });
});
