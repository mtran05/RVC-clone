"use strict";

// Page behavior for the live window.
// Reads the form, asks the main process to start or stop inference/realtime.py,
// and keeps the log and device lists in sync with that process.

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const startBtn = document.getElementById("start");
const modelSelect = document.getElementById("model");
const indexSelect = document.getElementById("index");
const keyInput = document.getElementById("key");

let running = false;
const logLines = [];

// Status text also drives the lamp color: Live, Stopped, or anything else.
function setStatus(text) {
  statusEl.textContent = text;
  document.body.classList.toggle("stopped", text === "Stopped");
}

// Keep the newest 80 lines. Older lines are dropped so the log cannot grow forever.
function pushLog(line) {
  logLines.push(line);
  if (logLines.length > 80) logLines.shift();
  logEl.textContent = logLines.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
  const logEmpty = document.getElementById("log-empty");
  if (logEmpty) logEmpty.hidden = true;
}

// Wipe the stored lines and show the empty-state sentence again.
function clearLog() {
  logLines.length = 0;
  logEl.textContent = "";
  const logEmpty = document.getElementById("log-empty");
  if (logEmpty) logEmpty.hidden = false;
}

// The running Python process does not see later edits, so freeze the controls it was given.
// Stop, More settings, Clear, and the help buttons stay clickable.
function setLocked(on) {
  const nodes = document.querySelectorAll(
    ".stage input, .stage .step, .rack select, .rack input, .rack .step, #browse-model, #browse-index, #refresh, #more input, #more .step"
  );
  for (const el of nodes) el.disabled = on;
}

// Switch the window between idle and live. The Go live button becomes Stop.
function setLive(on) {
  running = on;
  document.body.classList.toggle("live", on);
  startBtn.textContent = on ? "Stop" : "Go live";
  setStatus(on ? "Live" : "Idle");
  setLocked(on);
}

function baseName(file) {
  return String(file).split(/[/\\]/).pop();
}

// Rebuild a file dropdown. Keeps the current choice if that path is still in the list.
function fillSelect(select, files, emptyLabel) {
  const current = select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = emptyLabel;
  select.appendChild(empty);
  for (const file of files) {
    const option = document.createElement("option");
    option.value = file;
    option.textContent = baseName(file);
    select.appendChild(option);
  }
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

// Add a browsed file if it was not already listed, then select it.
function addFile(select, file) {
  if (!file) return;
  if (![...select.options].some((option) => option.value === file)) {
    const option = document.createElement("option");
    option.value = file;
    option.textContent = baseName(file);
    select.appendChild(option);
  }
  select.value = file;
  select.dispatchEvent(new Event("change"));
}

// Fill a microphone or speaker list, grouped by host API.
// Prefers the system default for that direction when nothing was already chosen.
function fillDevices(select, devices, channel) {
  const current = select.value;
  const want = channel === "inputs" ? "input" : "output";
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "System default";
  select.appendChild(empty);
  const groups = new Map();
  let picked = "";
  for (const device of devices) {
    if (device[channel] < 1) continue;
    const host = device.host || "Other";
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(device);
    if (!picked && device.note && device.note.includes(want)) picked = String(device.index);
  }
  const rank = ["Windows WASAPI", "MME", "Windows DirectSound", "Windows WDM-KS"];
  const hosts = [...groups.keys()].sort((a, b) => {
    const ia = rank.indexOf(a);
    const ib = rank.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  for (const host of hosts) {
    const group = document.createElement("optgroup");
    group.label = host;
    for (const device of groups.get(host)) {
      const option = document.createElement("option");
      option.value = String(device.index);
      option.textContent = device.note ? `${device.name} (${device.note})` : device.name;
      group.appendChild(option);
    }
    select.appendChild(group);
  }
  if (current && [...select.options].some((option) => option.value === current)) select.value = current;
  else if (picked) select.value = picked;
  return groups.size ? [...groups.values()].reduce((sum, list) => sum + list.length, 0) : 0;
}

// Show a slider's value and paint its filled portion through the --pct custom property.
function bindRange(id) {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}-out`);
  const paint = () => {
    const value = Number(input.value);
    output.textContent = value.toFixed(2);
    input.style.setProperty("--pct", `${value * 100}%`);
  };
  input.addEventListener("input", paint);
  paint();
}

// ponytail: ±24 st is two octaves. Raise min/max if a model needs more.
function setKey(value) {
  if (!Number.isFinite(value)) value = 0;
  const next = Math.max(-24, Math.min(24, Math.round(value)));
  keyInput.value = String(next);
  keyInput.classList.toggle("shifted", next !== 0);
  const scale = document.getElementById("key-scale");
  if (!scale) return;
  scale.value = String(next);
  scale.classList.toggle("shifted", next !== 0);
  scale.style.setProperty("--pct", `${((next + 24) / 48) * 100}%`);
}

// Snap a number field onto its step and clamp it to min and max.
// A blank or broken value falls back to the field's original value.
function legalNumber(input) {
  const step = Number(input.step);
  const places = (String(input.step).split(".")[1] || "").length;
  let value = Number(input.value);
  if (!Number.isFinite(value)) value = Number(input.defaultValue) || 0;
  if (Number.isFinite(step) && step > 0) value = Math.round(value / step) * step;
  if (input.min !== "") value = Math.max(Number(input.min), value);
  if (input.max !== "") value = Math.min(Number(input.max), value);
  input.value = places ? String(Number(value.toFixed(places))) : String(Math.round(value));
}

// Highest pitch must stay above the lowest. The field the user just edited wins.
function legalPitchRange(edited) {
  const minEl = document.getElementById("f0-min");
  const maxEl = document.getElementById("f0-max");
  legalNumber(minEl);
  legalNumber(maxEl);
  const min = Number(minEl.value);
  const max = Number(maxEl.value);
  if (max > min) return;
  if (edited === maxEl) {
    const nextMin = Math.max(1, max - 1);
    minEl.value = String(nextMin);
    if (Number(maxEl.value) <= nextMin) maxEl.value = String(nextMin + 1);
    return;
  }
  maxEl.value = String(min + 1);
}

// Latency is empty, low, high, or a number of seconds. Anything else is cleared.
function legalLatency(input) {
  const value = input.value.trim().toLowerCase();
  if (!value || value === "low" || value === "high" || Number.isFinite(Number(value))) {
    input.value = value;
    return;
  }
  input.value = "";
}

// Correct every field before Go live so the process never receives a bad value.
function legalFields() {
  for (const input of document.querySelectorAll('input[type="number"]')) {
    if (input.id === "key") continue;
    legalNumber(input);
  }
  legalPitchRange();
  legalLatency(document.getElementById("latency"));
}

// Shape the form into the object main.js turns into CLI flags.
function readOpts() {
  legalFields();
  const value = (id) => document.getElementById(id).value;
  const num = (id) => Number(value(id));
  return {
    model: value("model"),
    index: value("index"),
    indexRate: num("index-rate"),
    key: num("key"),
    formant: num("formant"),
    f0: document.querySelector('input[name="f0"]:checked').value,
    sampleRate: num("sample-rate"),
    blockTime: num("block-time"),
    crossfadeTime: num("crossfade-time"),
    extraTime: num("extra-time"),
    rmsMixRate: num("rms-mix-rate"),
    inputDevice: value("input-device"),
    outputDevice: value("output-device"),
    hostApi: value("host-api").trim(),
    inputChannels: num("input-channels"),
    outputChannels: num("output-channels"),
    latency: value("latency").trim(),
    inputGain: num("input-gain"),
    outputGain: num("output-gain"),
    noClip: document.getElementById("no-clip").checked,
    wasapiExclusive: document.getElementById("wasapi-exclusive").checked,
    wasapiAutoConvert: document.getElementById("wasapi-auto-convert").checked,
    f0Min: num("f0-min"),
    f0Max: num("f0-max"),
    rmvpeThreshold: num("rmvpe-threshold"),
    fcpeThreshold: num("fcpe-threshold"),
    indexNeighbors: num("index-neighbors"),
  };
}

// Reload the microphone and speaker lists from Python.
async function refreshDevices() {
  if (!window.rvc) return;
  const errorEl = document.getElementById("device-error");
  const countEl = document.getElementById("device-count");
  errorEl.hidden = true;
  countEl.textContent = "Looking for devices…";
  setStatus(running ? "Live" : "Looking for devices…");
  const result = await window.rvc.devices();
  if (!result.ok) {
    countEl.textContent = "";
    errorEl.hidden = false;
    errorEl.textContent = result.error;
    pushLog(result.error);
    if (!running) setStatus("Idle");
    return;
  }
  const mics = fillDevices(document.getElementById("input-device"), result.devices, "inputs");
  const speakers = fillDevices(document.getElementById("output-device"), result.devices, "outputs");
  countEl.textContent = `${mics} microphones, ${speakers} speakers`;
  if (!mics && !speakers) {
    errorEl.hidden = false;
    errorEl.textContent = "No microphones or speakers were reported.";
  }
  if (!running) setStatus("Idle");
}

const more = document.getElementById("more");
const moreToggle = document.getElementById("more-toggle");

// Show or hide the extra-settings overlay. Focus moves into it, then back to the button.
function setMore(open) {
  if (more.hidden === !open) return;
  more.hidden = !open;
  moreToggle.setAttribute("aria-expanded", String(open));
  if (open) document.getElementById("more-close").focus();
  else moreToggle.focus();
}

moreToggle.addEventListener("click", () => setMore(more.hidden));
document.getElementById("more-close").addEventListener("click", () => setMore(false));
more.addEventListener("click", (event) => {
  if (event.target === more) setMore(false);
});

// Pitch already has its own minus and plus. Every other number field gets the same pair.
for (const input of document.querySelectorAll('input[type="number"]')) {
  if (input.closest(".nudge")) continue;
  const nudge = document.createElement("div");
  nudge.className = "nudge";
  const name = (document.querySelector(`label[for="${input.id}"]`) || {}).textContent || "value";
  const down = document.createElement("button");
  down.type = "button";
  down.className = "step";
  down.textContent = "−";
  down.setAttribute("aria-label", `Decrease ${name}`);
  const up = document.createElement("button");
  up.type = "button";
  up.className = "step";
  up.textContent = "+";
  up.setAttribute("aria-label", `Increase ${name}`);
  input.before(nudge);
  nudge.append(down, input, up);
}

// Minus sits before the field, plus after it. Pitch updates the scale as well as the number.
document.body.addEventListener("click", (event) => {
  const button = event.target.closest(".nudge .step");
  if (!button) return;
  const input = button.parentElement.querySelector("input");
  if (!input) return;
  const step = Number(input.step) || 1;
  const dir = button.nextElementSibling === input ? -1 : 1;
  let value = Number(input.value);
  if (!Number.isFinite(value)) value = 0;
  value += dir * step;
  if (input.min !== "") value = Math.max(Number(input.min), value);
  if (input.max !== "") value = Math.min(Number(input.max), value);
  if (input.id === "key") {
    setKey(value);
    return;
  }
  input.value = String(value);
  input.dispatchEvent(new Event("change"));
});

keyInput.addEventListener("input", () => setKey(Number(keyInput.value)));
document.getElementById("key-scale").addEventListener("input", (event) => setKey(Number(event.target.value)));
setKey(Number(keyInput.value));

for (const input of document.querySelectorAll('input[type="number"]')) {
  if (input.id === "key") continue;
  input.addEventListener("change", () => {
    if (input.id === "f0-min" || input.id === "f0-max") legalPitchRange(input);
    else legalNumber(input);
  });
}
document.getElementById("latency").addEventListener("change", () => legalLatency(document.getElementById("latency")));

bindRange("index-rate");
bindRange("rms-mix-rate");

document.getElementById("browse-model").addEventListener("click", async () => {
  if (!window.rvc) return;
  addFile(modelSelect, await window.rvc.browse("model"));
});

document.getElementById("browse-index").addEventListener("click", async () => {
  if (!window.rvc) return;
  addFile(indexSelect, await window.rvc.browse("index"));
});

document.getElementById("refresh").addEventListener("click", refreshDevices);

const tipPop = document.getElementById("tip-pop");
let tipBtn = null;

// One help popup is open at a time. The text comes from the hidden paragraph named by the button.
function closeTip() {
  if (tipBtn) tipBtn.setAttribute("aria-expanded", "false");
  tipBtn = null;
  tipPop.hidden = true;
}

// Keep the popup inside the control's box when it fits, otherwise inside the window.
function placeTip() {
  if (!tipBtn) return;
  const box = tipBtn.getBoundingClientRect();
  const host = tipBtn.closest(".panel, .field, fieldset, .checks");
  const hostBox = host ? host.getBoundingClientRect() : box;
  const margin = 8;
  const maxWidth = Math.max(160, Math.min(260, hostBox.width - 16));
  tipPop.style.maxWidth = `${maxWidth}px`;
  tipPop.hidden = false;
  const width = tipPop.offsetWidth;
  const height = tipPop.offsetHeight;
  let left = box.right - width;
  const hostLeft = hostBox.left + 8;
  const hostRight = hostBox.right - 8;
  if (left < hostLeft) left = hostLeft;
  if (left + width > hostRight) left = hostRight - width;
  left = Math.max(margin, Math.min(left, window.innerWidth - margin - width));
  let top = box.bottom + 6;
  if (top + height > window.innerHeight - margin) top = box.top - 6 - height;
  if (top < margin) top = margin;
  tipPop.style.left = `${left}px`;
  tipPop.style.top = `${top}px`;
}

document.body.addEventListener("click", (event) => {
  const button = event.target.closest(".tip-btn");
  if (button) {
    if (tipBtn === button) {
      closeTip();
      return;
    }
    if (tipBtn) tipBtn.setAttribute("aria-expanded", "false");
    tipBtn = button;
    button.setAttribute("aria-expanded", "true");
    const source = document.getElementById(button.getAttribute("aria-controls"));
    tipPop.textContent = source ? source.textContent : "";
    placeTip();
    return;
  }
  if (!event.target.closest("#tip-pop")) closeTip();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!more.hidden) setMore(false);
  closeTip();
});

window.addEventListener("resize", () => {
  if (tipBtn) placeTip();
});

document.addEventListener("scroll", () => {
  if (tipBtn) closeTip();
}, true);

document.getElementById("clear-log").addEventListener("click", clearLog);

// Go live sends the form once. Stop kills that process. A failed start only writes the error.
startBtn.addEventListener("click", async () => {
  if (!window.rvc) return;
  if (running) {
    await window.rvc.stop();
    return;
  }
  const result = await window.rvc.start(readOpts());
  if (!result.ok) {
    pushLog(result.error);
    return;
  }
  setLive(true);
});

fillSelect(modelSelect, [], "Choose a model");
fillSelect(indexSelect, [], "None");
fillDevices(document.getElementById("input-device"), [], "inputs");
fillDevices(document.getElementById("output-device"), [], "outputs");

// Opening index.html in a browser has no Electron bridge, so the page stays in preview.
if (!window.rvc) {
  setStatus("Preview");
} else {
  window.rvc.onLog(pushLog);
  window.rvc.onExit((info) => {
    setLive(false);
    if (!info.expected) {
      if (info.code) pushLog(`Stopped (${info.code})`);
      setStatus("Stopped");
    }
  });
  window.rvc.assets().then((assets) => {
    fillSelect(modelSelect, assets.models, "Choose a model");
    fillSelect(indexSelect, assets.indices, "None");
    if (assets.models.length === 1) modelSelect.value = assets.models[0];
  });
  refreshDevices();
}
