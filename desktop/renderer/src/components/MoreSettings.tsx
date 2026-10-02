import { useEffect } from "react";
import { InferenceOpts } from "../lib/bridge";
import { legalLatency } from "../lib/opts";
import Field from "./Field";
import NudgeNumber from "./NudgeNumber";
import TipButton from "./TipButton";

// Modal with the less-used knobs: timing, pitch tracking range, index search,
// gain, and WASAPI device options. Escape or clicking the backdrop closes it.
interface Props {
  opts: InferenceOpts;
  running: boolean;
  onChange: <K extends keyof InferenceOpts>(key: K, value: InferenceOpts[K]) => void;
  onClose: () => void;
  setPitchRange: (edited: "min" | "max", value: number) => void;
}

export default function MoreSettings({ opts, running, onChange, onClose, setPitchRange }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="more-title">
        <div className="sheet-bar">
          <h2 id="more-title">More settings</h2>
          <button type="button" className="text" id="more-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="more">
          <section>
            <h3 className="group">Timing</h3>
            <div className="bunch">
              <Field id="block-time" label="Block (seconds)" tipLabel="About block" tip="How much of your voice is converted at once. A smaller number answers faster and works the computer harder.">
                <NudgeNumber id="block-time" value={opts.blockTime} step={0.01} min={0.01} disabled={running} onChange={(v) => onChange("blockTime", v)} />
              </Field>
              <Field id="crossfade-time" label="Crossfade (seconds)" tipLabel="About crossfade" tip="A short blend between each piece of audio so you do not hear clicks.">
                <NudgeNumber id="crossfade-time" value={opts.crossfadeTime} step={0.01} min={0} disabled={running} onChange={(v) => onChange("crossfadeTime", v)} />
              </Field>
              <Field id="extra-time" label="Context (seconds)" tipLabel="About context" tip="How much of what you just said is kept in mind. More of it can sound steadier.">
                <NudgeNumber id="extra-time" value={opts.extraTime} step={0.1} min={0} disabled={running} onChange={(v) => onChange("extraTime", v)} />
              </Field>
            </div>
          </section>
          <section>
            <h3 className="group">Pitch</h3>
            <div className="bunch">
              <Field id="f0-min" label="Lowest pitch (Hz)" tipLabel="About lowest pitch" tip="The lowest tone counted as a voice. Anything lower is ignored.">
                <NudgeNumber id="f0-min" value={opts.f0Min} step={1} min={1} disabled={running} onChange={(v) => setPitchRange("min", v)} />
              </Field>
              <Field id="f0-max" label="Highest pitch (Hz)" tipLabel="About highest pitch" tip="The highest tone counted as a voice. Keep it above the lowest pitch.">
                <NudgeNumber id="f0-max" value={opts.f0Max} step={1} min={1} disabled={running} onChange={(v) => setPitchRange("max", v)} />
              </Field>
              <Field id="rmvpe-threshold" label="RMVPE threshold" tipLabel="About RMVPE threshold" tip="How sure the usual pitch method must be before it counts a note. A higher number ignores more noise.">
                <NudgeNumber id="rmvpe-threshold" value={opts.rmvpeThreshold} step={0.001} min={0} disabled={running} onChange={(v) => onChange("rmvpeThreshold", v)} />
              </Field>
              <Field id="fcpe-threshold" label="FCPE threshold" tipLabel="About FCPE threshold" tip="How sure the lighter pitch method must be before it counts a note. A higher number ignores more noise.">
                <NudgeNumber id="fcpe-threshold" value={opts.fcpeThreshold} step={0.001} min={0} disabled={running} onChange={(v) => onChange("fcpeThreshold", v)} />
              </Field>
            </div>
          </section>
          <section>
            <h3 className="group">Index</h3>
            <div className="bunch">
              <Field id="index-neighbors" label="Index neighbors" tipLabel="About index neighbors" tip="How many close matches from the index file are mixed together. Use a whole number, at least 1.">
                <NudgeNumber id="index-neighbors" value={opts.indexNeighbors} step={1} min={1} disabled={running} onChange={(v) => onChange("indexNeighbors", v)} />
              </Field>
            </div>
          </section>
          <section>
            <h3 className="group">Gain</h3>
            <div className="bunch">
              <Field id="input-gain" label="Mic gain" tipLabel="About mic gain" tip="Turns the microphone up or down before conversion. 1 leaves it as it is.">
                <NudgeNumber id="input-gain" value={opts.inputGain} step={0.1} min={0} disabled={running} onChange={(v) => onChange("inputGain", v)} />
              </Field>
              <Field id="output-gain" label="Speaker gain" tipLabel="About speaker gain" tip="Turns the converted voice up or down. 1 leaves it as it is.">
                <NudgeNumber id="output-gain" value={opts.outputGain} step={0.1} min={0} disabled={running} onChange={(v) => onChange("outputGain", v)} />
              </Field>
              <div className="checks">
                <label className="check">
                  <input type="checkbox" id="no-clip" checked={opts.noClip} disabled={running} onChange={(e) => onChange("noClip", e.target.checked)} />
                  Don&apos;t clip
                </label>
                <TipButton text="Off keeps loud peaks inside a safe range. On leaves those peaks alone." label="About clipping" />
              </div>
            </div>
          </section>
          <section>
            <h3 className="group">Device</h3>
            <div className="bunch">
              <Field id="sample-rate" label="Sample rate" tipLabel="About sample rate" tip="How many samples play each second. 0 uses the voice model's own rate. Use a whole number.">
                <NudgeNumber id="sample-rate" value={opts.sampleRate} step={1} min={0} disabled={running} onChange={(v) => onChange("sampleRate", v)} />
              </Field>
              <Field id="input-channels" label="Mic channels" tipLabel="About mic channels" tip="How many microphone channels to open. They are mixed into one voice. Use a whole number, at least 1.">
                <NudgeNumber id="input-channels" value={opts.inputChannels} step={1} min={1} disabled={running} onChange={(v) => onChange("inputChannels", v)} />
              </Field>
              <Field id="output-channels" label="Speaker channels" tipLabel="About speaker channels" tip="How many speaker channels to play. The voice is copied onto each one. Use a whole number, at least 1.">
                <NudgeNumber id="output-channels" value={opts.outputChannels} step={1} min={1} disabled={running} onChange={(v) => onChange("outputChannels", v)} />
              </Field>
              <Field id="latency" label="Latency" tipLabel="About latency" tip="How long the sound card waits. Type low, high, or a number of seconds. Leave it empty to let the computer choose. This is separate from block time.">
                <input id="latency" className="control" type="text" value={opts.latency} disabled={running} placeholder="low, high, or seconds" spellCheck={false} autoComplete="off" onChange={(e) => onChange("latency", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} onBlur={(e) => onChange("latency", legalLatency(e.target.value))} />
              </Field>
              <Field id="host-api" label="Host API" tipLabel="About host API" tip="Show devices from only one sound system, such as WASAPI. Leave it empty to allow every system.">
                <input id="host-api" className="control" type="text" value={opts.hostApi} disabled={running} placeholder="WASAPI" spellCheck={false} autoComplete="off" onChange={(e) => onChange("hostApi", e.target.value)} />
              </Field>
              <div className="checks">
                <label className="check">
                  <input type="checkbox" id="wasapi-exclusive" checked={opts.wasapiExclusive} disabled={running} onChange={(e) => onChange("wasapiExclusive", e.target.checked)} />
                  WASAPI exclusive
                </label>
                <TipButton text="Takes over the WASAPI microphone and speakers so other apps cannot share them. Both devices must be WASAPI." label="About WASAPI exclusive" />
                <label className="check">
                  <input type="checkbox" id="wasapi-auto-convert" checked={opts.wasapiAutoConvert} disabled={running} onChange={(e) => onChange("wasapiAutoConvert", e.target.checked)} />
                  WASAPI resample
                </label>
                <TipButton text="Lets WASAPI change the rate when a device does not match. Both the microphone and speakers must be WASAPI." label="About WASAPI resample" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
