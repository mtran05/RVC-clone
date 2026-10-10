"use strict";

// Temporary layout probe. Dumps real geometry of the shell so layout problems
// can be diagnosed from measurements instead of guesses. Not loaded in normal
// runs; main.js only requires it when DEBUG_LAYOUT is set.

const fs = require("fs");
const os = require("os");
const path = require("path");

const PROBE = `(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return sel + "\\n   MISSING";
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return sel + "\\n" +
      "   rect      = " + [r.x, r.y, r.width, r.height].map((n) => Math.round(n)).join(", ") + "\\n" +
      "   display   = " + c.display + "\\n" +
      "   columns   = " + c.gridTemplateColumns + "\\n" +
      "   rows      = " + c.gridTemplateRows + "\\n" +
      "   overflow  = " + c.overflowX + "/" + c.overflowY;
  };
  return [
    "viewport = " + innerWidth + " x " + innerHeight + "  dpr=" + devicePixelRatio,
    "",
    pick("#root > div"),
    pick("nav"),
    pick("header"),
    pick("main"),
    pick("main > div"),
    pick("main aside"),
    pick("section[aria-label=Logs]"),
    pick("main > div > section"),
  ].join("\\n");
})()`;

module.exports = function debugLayout(win) {
  win.webContents.on("did-finish-load", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const report = await win.webContents.executeJavaScript(PROBE);
    fs.writeFileSync(path.join(os.tmpdir(), "layout-report.txt"), report);
    const { app } = require("electron");
    app.exit(0);
  });
};
