"use strict";

// Build the argument list for `python -m inference.realtime --live`.
// parseDevices reads the text table printed by --list-devices.
// Every flag, default, and choice comes from shared/opts-spec.json, which is
// also read by the renderer and by inference/realtime.py.

const { options: SPEC } = require("./shared/opts-spec.json");

const isNumber = (spec) => spec.kind === "number";

// Numeric options, in spec order, paired with their CLI flag.
const NUMBERS = Object.entries(SPEC)
  .filter(([, spec]) => isNumber(spec))
  .map(([key, spec]) => [key, spec.flag]);

// Options passed as a bare flag when true and omitted when false.
const FLAGS = Object.entries(SPEC)
  .filter(([, spec]) => spec.kind === "bool")
  .map(([key, spec]) => [key, spec.flag]);

// opts uses the page's field names. Empty optional strings are left off the command.
function buildArgs(opts) {
  if (!opts || !opts.model) throw new Error("Model is required");
  const f0Spec = SPEC.f0;
  if (!f0Spec.choices.includes(opts.f0)) {
    throw new Error(`Pitch method must be ${f0Spec.choices.join(", ")}`);
  }
  const latency = opts.latency == null ? "" : String(opts.latency).trim();
  if (latency && latency !== "low" && latency !== "high" && !Number.isFinite(Number(latency))) {
    throw new Error("Latency must be low, high, or seconds");
  }
  const numbers = {};
  for (const [key] of NUMBERS) {
    const value = Number(opts[key]);
    if (!Number.isFinite(value)) throw new Error(`${SPEC[key].flag} must be a number`);
    numbers[key] = value;
  }
  if (numbers.f0Min <= 0 || numbers.f0Max <= numbers.f0Min) {
    throw new Error("Lowest pitch must be above 0 and below the highest pitch");
  }
  if (numbers.inputChannels < 1 || numbers.outputChannels < 1) {
    throw new Error("Channel counts must be at least 1");
  }
  if (numbers.indexNeighbors < 1) throw new Error("Index neighbors must be at least 1");

  const args = ["-m", "inference.realtime", "--live", "--model", String(opts.model), "--f0", opts.f0];
  if (opts.index) args.push(SPEC.index.flag, String(opts.index));
  if (opts.inputDevice) args.push(SPEC.inputDevice.flag, String(opts.inputDevice));
  if (opts.outputDevice) args.push(SPEC.outputDevice.flag, String(opts.outputDevice));
  if (opts.hostApi) args.push(SPEC.hostApi.flag, String(opts.hostApi).trim());
  if (latency) args.push(SPEC.latency.flag, latency);
  for (const [key, flag] of NUMBERS) args.push(flag, String(numbers[key]));
  for (const [key, flag] of FLAGS) if (opts[key]) args.push(flag);
  return args;
}

// Device names can wrap onto the next line. Join those before matching columns.
function parseDevices(text) {
  const devices = [];
  const merged = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*\d+\s+\d+\s+\d+\s+\d+\s+/.test(line) || merged.length === 0) merged.push(line);
    else merged[merged.length - 1] += line;
  }
  for (const line of merged) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const parts = match[5].split(/\s{2,}/);
    if (parts.length < 2) continue;
    devices.push({
      index: Number(match[1]),
      inputs: Number(match[2]),
      outputs: Number(match[3]),
      rate: Number(match[4]),
      host: parts[0].trim(),
      name: parts[1].trim(),
      note: parts.slice(2).join(" ").replace(/[()]/g, "").trim(),
    });
  }
  return devices;
}

// The starting opts: exactly what shared/opts-spec.json declares, so a new
// option needs no change here.
function defaultOpts() {
  const opts = {};
  for (const [key, spec] of Object.entries(SPEC)) opts[key] = spec.default;
  return opts;
}

module.exports = { buildArgs, parseDevices, defaultOpts };
