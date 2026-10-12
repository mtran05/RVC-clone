"use strict";

// Layout probe. Dumps real geometry of the shell so layout problems can be
// diagnosed from measurements instead of guesses. Not loaded in normal runs;
// main.js only requires it when DEBUG_LAYOUT is set.
//
//   $env:DEBUG_LAYOUT=1; npm start
//   -> %TEMP%\layout-report.txt

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
  const rail = [];
  for (const link of document.querySelectorAll("nav a")) {
    const r = link.getBoundingClientRect();
    const c = getComputedStyle(link);
    const range = document.createRange();
    range.selectNodeContents(link);
    const text = range.getBoundingClientRect();
    rail.push(
      "   link \\"" + link.textContent + "\\"" +
      "\\n      box        = " + r.width.toFixed(1) + " x " + r.height.toFixed(1) +
      "\\n      client     = " + link.clientWidth + " x " + link.clientHeight +
      "\\n      padding    = " + c.paddingLeft + " / " + c.paddingRight +
      "\\n      lineHeight = " + c.lineHeight + "   fontSize = " + c.fontSize +
      "\\n      textBox    = " + text.width.toFixed(1) + " x " + text.height.toFixed(1) +
      "\\n      scrollWidth= " + link.scrollWidth + "   wrap = " + c.overflowWrap + c.wordBreak
    );
  }
  const nav = document.querySelector("nav");
  const navRect = nav ? nav.getBoundingClientRect() : null;
  return [
    "viewport = " + innerWidth + " x " + innerHeight + "  dpr=" + devicePixelRatio,
    "nav box = " + (navRect ? navRect.width.toFixed(1) + " x " + navRect.height.toFixed(1) : "?"),
    "",
    pick("#root > div"),
    pick("main"),
    pick("main > div"),
    pick("main aside"),
    pick("section[aria-label=Logs]"),
    "",
    "rail links:",
    ...rail,
  ].join("\\n");
})()`;

module.exports = function debugLayout(win) {
  win.webContents.on("did-finish-load", async () => {
    const path = require("path");
    const os = require("os");
    const fs = require("fs");
    const out = path.join(os.tmpdir(), "layout-report.txt");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    let report;
    try {
      report = await win.webContents.executeJavaScript(PROBE);
    } catch (error) {
      report = "PROBE FAILED\n" + (error && error.stack ? error.stack : String(error));
    }
    fs.writeFileSync(out, report);
    const { app } = require("electron");
    app.exit(0);
  });
};
