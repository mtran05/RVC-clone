"use strict";

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const startBtn = document.getElementById("start");
const modelSelect = document.getElementById("model");
const indexSelect = document.getElementById("index");
const keyInput = document.getElementById("key");

let running = false;
const logLines = [];

function setStatus(text) {
  statusEl.textContent = text;
  document.body.classList.toggle("stopped", text === "Stopped");
}

function pushLog(line) {
  logLines.push(line);
  if (logLines.length > 80) logLines.shift();
  logEl.textContent = logLines.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
  const logEmpty = document.getElementById("log-empty");
  if (logEmpty) logEmpty.hidden = true;
}

function setLive(on) {
  running = on;
  document.body.classList.toggle("live", on);
  startBtn.textContent = on ? "Stop" : "Go live";
  setStatus(on ? "Live" : "Idle");
}

function baseName(file) {
  return String(file).split(/[/\\]/).pop();
}

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
  const next = Math.max(-24, Math.min(24, value));
  keyInput.value = String(next);
  keyInput.classList.toggle("shifted", next !== 0);
  const scale = document.getElementById("key-scale");
  if (!scale) return;
  scale.value = String(next);
  scale.classList.toggle("shifted", next !== 0);
  scale.style.setProperty("--pct", `${((next + 24) / 48) * 100}%`);
}

function readOpts() {
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

document.getElementById("key-down").addEventListener("click", () => setKey(Number(keyInput.value) - 1));
document.getElementById("key-up").addEventListener("click", () => setKey(Number(keyInput.value) + 1));
keyInput.addEventListener("input", () => setKey(Number(keyInput.value)));
document.getElementById("key-scale").addEventListener("input", (event) => setKey(Number(event.target.value)));
setKey(Number(keyInput.value));

bindRange("index-rate");
bindRange("rms-mix-rate");

const formantInput = document.getElementById("formant");
const formantOut = document.getElementById("formant-out");
const paintFormant = () => {
  formantOut.textContent = Number(formantInput.value).toFixed(1);
};
formantInput.addEventListener("input", paintFormant);
paintFormant();

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

function closeTip() {
  if (tipBtn) tipBtn.setAttribute("aria-expanded", "false");
  tipBtn = null;
  tipPop.hidden = true;
}

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

function closePitchTip() {
  const button = document.querySelector(".pitch-panel .tip-btn");
  const source = document.getElementById("tip-key");
  if (button) button.setAttribute("aria-expanded", "false");
  if (source) source.hidden = true;
}

document.body.addEventListener("click", (event) => {
  const button = event.target.closest(".tip-btn");
  if (button && button.closest(".pitch-panel")) {
    closeTip();
    const source = document.getElementById(button.getAttribute("aria-controls"));
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    if (source) source.hidden = open;
    return;
  }
  if (button) {
    closePitchTip();
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
  closePitchTip();
});

window.addEventListener("resize", () => {
  if (tipBtn) placeTip();
});

document.addEventListener("scroll", () => {
  if (tipBtn) closeTip();
}, true);

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
