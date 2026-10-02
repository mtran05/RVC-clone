import { useEffect, useRef, useState } from "react";
import { bridge, Device, InferenceOpts } from "../lib/bridge";
import { clampKey, legalLatency, legalNumber } from "../lib/opts";
import { useSession } from "../lib/session";
import Field from "../components/Field";
import TipButton from "../components/TipButton";
import NudgeNumber from "../components/NudgeNumber";
import RangeField from "../components/RangeField";
import MoreSettings from "../components/MoreSettings";

// The live page: pitch controls on the left, voice/device settings in the right
// rack, and the Python process log along the bottom.
function baseName(file: string): string {
  return String(file).split(/[/\\]/).pop() ?? file;
}

const HOST_RANK = ["Windows WASAPI", "MME", "Windows DirectSound", "Windows WDM-KS"];

// Microphone/speaker dropdown, grouped by PortAudio host API. "System default"
// is the empty value, which tells the inference process to follow Windows.
function DeviceSelect({
  id,
  devices,
  channel,
  value,
  disabled,
  onChange,
}: {
  id: string;
  devices: Device[];
  channel: "inputs" | "outputs";
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const groups = new Map<string, Device[]>();
  for (const device of devices) {
    if (device[channel] < 1) continue;
    const host = device.host || "Other";
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host)!.push(device);
  }
  const hosts = [...groups.keys()].sort((a, b) => {
    const ia = HOST_RANK.indexOf(a);
    const ib = HOST_RANK.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return (
    <select id={id} className="control" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">System default</option>
      {hosts.map((host) => (
        <optgroup key={host} label={host}>
          {groups.get(host)!.map((d) => (
            <option key={d.index} value={String(d.index)}>
              {d.note ? `${d.name} (${d.note})` : d.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function LivePage() {
  const { running, logLines, pushLog, clearLog, setLive, devices, deviceCount, deviceError, refreshDevices, opts, setOpt, setOpts } =
    useSession();
  const [models, setModels] = useState<string[]>([]);
  const [indices, setIndices] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const set = setOpt;

  // Load the model/index lists once. A single model auto-selects.
  useEffect(() => {
    const rvc = bridge();
    if (!rvc) return;
    rvc.assets().then((assets) => {
      setModels(assets.models);
      setIndices(assets.indices);
      if (assets.models.length === 1) set("model", assets.models[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll the log when a new line arrives.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  // Toggle "Run live / Stop": a running process is stopped; otherwise sanitize
  // the form and send it to main.js, which spawns inference/realtime.py.
  const goLive = async () => {
    const rvc = bridge();
    if (!rvc) return;
    if (running) {
      await rvc.stop();
      return;
    }
    const cleaned: InferenceOpts = {
      ...opts,
      latency: legalLatency(opts.latency),
      hostApi: opts.hostApi.trim(),
      f0Min: legalNumber(opts.f0Min, 1, 1, null, 50),
      f0Max: legalNumber(opts.f0Max, 1, 1, null, 1100),
    };
    if (cleaned.f0Max <= cleaned.f0Min) cleaned.f0Max = cleaned.f0Min + 1;
    setOpts(cleaned);
    const result = await rvc.start(cleaned);
    if (!result.ok) {
      pushLog(result.error);
      return;
    }
    setLive(true);
  };

  // Keep the pitch range sane: editing one bound never lets it cross the other.
  const setPitchRange = (edited: "min" | "max", value: number) => {
    setOpts((o) => {
      const next = { ...o };
      if (edited === "min") {
        next.f0Min = legalNumber(value, 1, 1, null, 50);
        if (next.f0Max <= next.f0Min) next.f0Max = next.f0Min + 1;
      } else {
        next.f0Max = legalNumber(value, 1, 1, null, 1100);
        if (next.f0Max <= next.f0Min) next.f0Min = Math.max(1, next.f0Max - 1);
      }
      return next;
    });
  };

  // A browsed-in file always stays selectable, even if it is outside assets/.
  const modelOptions = models.includes(opts.model) ? models : opts.model ? [opts.model, ...models] : models;
  const indexOptions = indices.includes(opts.index) ? indices : opts.index ? [opts.index, ...indices] : indices;

  return (
    <>
      <section className="stage">
        <div className="pitch-panel">
          <div className="label-row">
            <span className="panel-label">Pitch</span>
            <TipButton
              label="About pitch"
              text="Moves your voice up or down. A higher number sounds higher. A lower number sounds lower. It stops at two octaves."
            />
          </div>
          <div className="dial">
            <div className="ticks" aria-hidden="true">
              <span>−24</span>
              <span>−12</span>
              <span>0</span>
              <span>+12</span>
              <span>+24</span>
            </div>
            <input
              id="key-scale"
              type="range"
              min="-24"
              max="24"
              step="1"
              value={opts.key}
              disabled={running}
              aria-label="Pitch scale"
              className={opts.key !== 0 ? "shifted" : ""}
              style={{ "--pct": `${((opts.key + 24) / 48) * 100}%` } as React.CSSProperties}
              onChange={(e) => set("key", clampKey(Number(e.target.value)))}
            />
            <div className="readout">
              <NudgeNumber
                id="key"
                value={opts.key}
                step={1}
                min={-24}
                max={24}
                disabled={running}
                ariaLabel="Pitch in semitones"
                className={opts.key !== 0 ? "shifted" : ""}
                onChange={(v) => set("key", clampKey(v))}
              />
              <span className="unit">semitones</span>
            </div>
          </div>
        </div>

        <fieldset>
          <div className="label-row">
            <legend>Pitch tracker</legend>
            <TipButton
              label="About pitch tracker"
              text="How the app hears the note you are singing. RMVPE is the usual choice. FCPE uses less of the computer. PM is the older method."
            />
          </div>
          <div className="choices">
            {(["rmvpe", "fcpe", "pm"] as const).map((method) => (
              <label key={method}>
                <input
                  type="radio"
                  name="f0"
                  value={method}
                  checked={opts.f0 === method}
                  disabled={running}
                  onChange={() => set("f0", method)}
                />
                {method.toUpperCase()}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="pair">
          <section>
            <Field id="formant" label="Formant" tipLabel="About formant" tip="Makes the voice brighter or darker without moving the note as much. 0 leaves the tone alone.">
              <NudgeNumber id="formant" value={opts.formant} step={0.1} disabled={running} onChange={(v) => set("formant", v)} />
            </Field>
          </section>
          <section>
            <Field
              id="rms-mix-rate"
              label="Loudness mix"
              tipLabel="About loudness mix"
              tip="0 follows how loud you are. 1 keeps the loudness of the chosen voice."
              extra={<output id="rms-mix-rate-out">{opts.rmsMixRate.toFixed(2)}</output>}
            >
              <RangeField id="rms-mix-rate" value={opts.rmsMixRate} min={0} max={1} step={0.01} disabled={running} onChange={(v) => set("rmsMixRate", v)} />
            </Field>
          </section>
        </div>
      </section>

      <aside className="rack">
        <div className="rack-body">
          <p className="group">Voice</p>
          <Field id="model" label="Model" tipLabel="About model" tip="The voice you want to sound like. Pick one before you go live.">
            <div className="row">
              <select id="model" className="control" value={opts.model} disabled={running} onChange={(e) => set("model", e.target.value)}>
                <option value="">Choose a model</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {baseName(m)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghost"
                id="browse-model"
                disabled={running}
                onClick={async () => {
                  const file = await bridge()?.browse("model");
                  if (!file) return;
                  setModels((m) => (m.includes(file) ? m : [...m, file]));
                  set("model", file);
                }}
              >
                Browse
              </button>
            </div>
          </Field>
          <Field id="index" label="Index" tipLabel="About index" tip="An optional file that pulls the result closer to that voice. None turns this off.">
            <div className="row">
              <select id="index" className="control" value={opts.index} disabled={running} onChange={(e) => set("index", e.target.value)}>
                <option value="">None</option>
                {indexOptions.map((i) => (
                  <option key={i} value={i}>
                    {baseName(i)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghost"
                id="browse-index"
                disabled={running}
                onClick={async () => {
                  const file = await bridge()?.browse("index");
                  if (!file) return;
                  setIndices((list) => (list.includes(file) ? list : [...list, file]));
                  set("index", file);
                }}
              >
                Browse
              </button>
            </div>
          </Field>
          <Field
            id="index-rate"
            label="Index rate"
            tipLabel="About index rate"
            tip="How much the index file is used. 0 uses only the voice. 1 leans on the index as much as it can."
            extra={<output id="index-rate-out">{opts.indexRate.toFixed(2)}</output>}
          >
            <RangeField id="index-rate" value={opts.indexRate} min={0} max={1} step={0.01} disabled={running} onChange={(v) => set("indexRate", v)} />
          </Field>

          <p className="group">Audio</p>
          <Field id="input-device" label="Microphone" tipLabel="About microphone" tip="The microphone you speak into. System default follows the one Windows is using.">
            <DeviceSelect id="input-device" devices={devices} channel="inputs" value={opts.inputDevice} disabled={running} onChange={(v) => set("inputDevice", v)} />
          </Field>
          <Field id="output-device" label="Speakers" tipLabel="About speakers" tip="Where the converted voice plays. System default uses your usual speakers.">
            <DeviceSelect id="output-device" devices={devices} channel="outputs" value={opts.outputDevice} disabled={running} onChange={(v) => set("outputDevice", v)} />
          </Field>
          <p className="device-count">{deviceCount}</p>
          {deviceError && <p className="device-error">{deviceError}</p>}
          <button type="button" className="text" id="refresh" disabled={running} onClick={refreshDevices}>
            Refresh devices
          </button>
        </div>
        <button type="button" className="more-toggle" id="more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          More settings
        </button>
        <button type="button" className="start" id="start" onClick={goLive}>
          {running ? "Stop" : "Go live"}
        </button>
      </aside>

      <section className="tape" aria-label="Logs">
        <div className="tape-bar">
          <h2>Logs</h2>
          <button type="button" className="text" id="clear-log" onClick={clearLog}>
            Clear
          </button>
        </div>
        {logLines.length === 0 && <p className="log-empty">Logs are displayed here.</p>}
        <pre id="log" aria-live="polite" ref={logRef}>
          {logLines.join("\n")}
        </pre>
      </section>

      {moreOpen && <MoreSettings opts={opts} running={running} onChange={set} onClose={() => setMoreOpen(false)} setPitchRange={setPitchRange} />}
    </>
  );
}
