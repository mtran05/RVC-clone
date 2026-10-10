import { useEffect, useId, useRef, useState } from "react";
import { bridge } from "../lib/bridge";
import { clampKey } from "../lib/opts";
import { sanitizeOpts } from "../lib/sanitize";
import { rangeOf, specOf } from "../lib/specs";
import { useSession } from "../lib/session";
import BrowseField from "../components/BrowseField";
import Button from "../components/Button";
import DeviceSelect from "../components/DeviceSelect";
import Field from "../components/Field";
import LabelRow from "../components/LabelRow";
import MoreSettings from "../components/MoreSettings";
import NudgeNumber from "../components/NudgeNumber";
import RadioChoices from "../components/RadioChoices";
import RangeField from "../components/RangeField";
import styles from "./LivePage.module.css";

const F0_METHODS = ["rmvpe", "fcpe", "pm"] as const;

const KEY = specOf("key");
const KEY_RANGE = rangeOf("key");
const F0 = specOf("f0");
const FORMANT = specOf("formant");
const LOUDNESS = specOf("rmsMixRate");
const LOUDNESS_RANGE = rangeOf("rmsMixRate");
const INDEX_RATE = specOf("indexRate");
const INDEX_RATE_RANGE = rangeOf("indexRate");
const MODEL = specOf("model");
const INDEX = specOf("index");
const INPUT_DEVICE = specOf("inputDevice");
const OUTPUT_DEVICE = specOf("outputDevice");

// The live page: pitch controls on the left, voice and device settings in the
// right rack, and the Python process log along the bottom.
export default function LivePage() {
  const { running, logLines, pushLog, clearLog, setLive, devices, scan, refreshDevices, opts, setOpts } = useSession();
  const [models, setModels] = useState<string[]>([]);
  const [indices, setIndices] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  // The legend names the radio group, so both need the same id.
  const trackerLabelId = useId();

  const patch = (change: Partial<typeof opts>) => setOpts((current) => ({ ...current, ...change }));

  // Load the model/index lists once. A single model auto-selects.
  useEffect(() => {
    const rvc = bridge();
    if (!rvc) return;
    void rvc.assets().then((assets) => {
      setModels(assets.models);
      setIndices(assets.indices);
      // A lone model needs no decision from the user.
      if (assets.models.length === 1) setOpts((current) => ({ ...current, model: assets.models[0] }));
    });
  }, [setOpts]);

  // Auto-scroll the log when a new line arrives.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  // Toggle "Go live / Stop". A running process is stopped; otherwise the form is
  // sanitized and handed to main.js, which spawns inference/realtime.py.
  const goLive = async () => {
    const rvc = bridge();
    if (!rvc) return;
    if (running) {
      await rvc.stop();
      return;
    }
    const cleaned = sanitizeOpts(opts);
    setOpts(cleaned);
    const result = await rvc.start(cleaned);
    if (!result.ok) {
      pushLog(result.error);
      return;
    }
    setLive(true);
  };

  return (
    <div className={styles.live}>
      <section className={styles.stage}>
        <div className={styles.pitchPanel}>
          <LabelRow as="span" label={KEY.label} tip={KEY.tip} />
          <div className={styles.dial}>
            <div className={styles.ticks} aria-hidden="true">
              <span>−24</span>
              <span>−12</span>
              <span>0</span>
              <span>+12</span>
              <span>+24</span>
            </div>
            <RangeField
              variant="dial"
              value={opts.key}
              min={KEY_RANGE.min}
              max={KEY_RANGE.max}
              step={1}
              disabled={running}
              ariaLabel="Pitch scale"
              onChange={(key) => patch({ key: clampKey(key) })}
            />
            <div className={styles.readout}>
              <NudgeNumber
                className={opts.key !== 0 ? styles.shifted : undefined}
                value={opts.key}
                step={1}
                min={KEY_RANGE.min}
                max={KEY_RANGE.max}
                disabled={running}
                ariaLabel="Pitch in semitones"
                onChange={(key) => patch({ key: clampKey(key) })}
              />
              <span className={styles.unit}>semitones</span>
            </div>
          </div>
        </div>

        <fieldset className={styles.tracker}>
          <LabelRow as="legend" id={trackerLabelId} label={F0.label} tip={F0.tip} />
          <RadioChoices id={trackerLabelId} name="f0" value={opts.f0} options={F0_METHODS} disabled={running} onChange={(f0) => patch({ f0 })} />
        </fieldset>

        <div className={styles.pair}>
          <Field label={FORMANT.label} tip={FORMANT.tip}>
            <NudgeNumber value={opts.formant} step={FORMANT.step} disabled={running} onChange={(formant) => patch({ formant })} />
          </Field>
          <Field label={LOUDNESS.label} tip={LOUDNESS.tip} extra={<output>{opts.rmsMixRate.toFixed(2)}</output>}>
            <RangeField
              value={opts.rmsMixRate}
              min={LOUDNESS_RANGE.min}
              max={LOUDNESS_RANGE.max}
              step={LOUDNESS.step!}
              disabled={running}
              onChange={(rmsMixRate) => patch({ rmsMixRate })}
            />
          </Field>
        </div>
      </section>

      <aside className={styles.rack}>
        <div className={styles.rackBody}>
          <h3 className={styles.group}>Voice</h3>
          <BrowseField
            kind="model"
            label={MODEL.label}
            tip={MODEL.tip}
            placeholder="Choose a model"
            value={opts.model}
            options={models}
            disabled={running}
            onBrowse={(file) => setModels((list) => (list.includes(file) ? list : [...list, file]))}
            onChange={(model) => patch({ model })}
          />
          <BrowseField
            kind="index"
            label={INDEX.label}
            tip={INDEX.tip}
            placeholder="None"
            value={opts.index}
            options={indices}
            disabled={running}
            onBrowse={(file) => setIndices((list) => (list.includes(file) ? list : [...list, file]))}
            onChange={(index) => patch({ index })}
          />
          <Field label={INDEX_RATE.label} tip={INDEX_RATE.tip} extra={<output>{opts.indexRate.toFixed(2)}</output>}>
            <RangeField
              value={opts.indexRate}
              min={INDEX_RATE_RANGE.min}
              max={INDEX_RATE_RANGE.max}
              step={INDEX_RATE.step!}
              disabled={running}
              onChange={(indexRate) => patch({ indexRate })}
            />
          </Field>

          <h3 className={styles.group}>Audio</h3>
          <Field label={INPUT_DEVICE.label} tip={INPUT_DEVICE.tip}>
            <DeviceSelect devices={devices} channel="inputs" value={opts.inputDevice} disabled={running} onChange={(inputDevice) => patch({ inputDevice })} />
          </Field>
          <Field label={OUTPUT_DEVICE.label} tip={OUTPUT_DEVICE.tip}>
            <DeviceSelect
              devices={devices}
              channel="outputs"
              value={opts.outputDevice}
              disabled={running}
              onChange={(outputDevice) => patch({ outputDevice })}
            />
          </Field>
          {scan.kind === "ready" && <p className={styles.deviceCount}>{`${scan.mics} microphones, ${scan.speakers} speakers`}</p>}
          {scan.kind === "error" && <p className={styles.deviceError}>{scan.message}</p>}
          <Button variant="text" disabled={running} onClick={() => void refreshDevices()}>
            Refresh devices
          </Button>
        </div>
        <Button variant="more" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          More settings
        </Button>
        <Button variant="start" running={running} onClick={() => void goLive()}>
          {running ? "Stop" : "Go live"}
        </Button>
      </aside>

      <section className={styles.tape} aria-label="Logs">
        <div className={styles.tapeBar}>
          <h2>Logs</h2>
          <Button variant="text" className={styles.tapeAction} onClick={clearLog}>
            Clear
          </Button>
        </div>
        {logLines.length === 0 && <p className={styles.logEmpty}>Logs are displayed here.</p>}
        <pre id="log" className={styles.log} aria-live="polite" ref={logRef}>
          {logLines.join("\n")}
        </pre>
      </section>

      {moreOpen && <MoreSettings opts={opts} running={running} onPatch={patch} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}
