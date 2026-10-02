"use strict";

// `npm start` runs this first. If electron.exe was never unpacked, download it and
// extract it with tar, then write the path file Electron's launcher expects.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const electronRoot = path.join(__dirname, "node_modules", "electron");
const dist = path.join(electronRoot, "dist");
const exe = path.join(dist, "electron.exe");
const pathFile = path.join(electronRoot, "path.txt");

if (fs.existsSync(exe) && fs.existsSync(pathFile)) process.exit(0);

async function main() {
  const { downloadArtifact } = require("@electron/get");
  const version = require(path.join(electronRoot, "package.json")).version;
  const zip = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: "win32",
    arch: process.arch,
    checksums: require(path.join(electronRoot, "checksums.json")),
  });
  fs.mkdirSync(dist, { recursive: true });
  // ponytail: tar, not extract-zip. Node 24 drops yauzl's handle, so electron's postinstall exits before path.txt exists.
  const unpacked = spawnSync("tar", ["-xf", zip, "-C", dist], { stdio: "inherit" });
  if (unpacked.status !== 0) process.exit(unpacked.status || 1);
  fs.writeFileSync(pathFile, "electron.exe");
  if (!fs.existsSync(exe)) {
    console.error("electron.exe missing after unpack");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
