import { ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { bridge, type InferenceOpts } from "../lib/bridge";
import { cx } from "../lib/cx";
import { baseName } from "../lib/format";
import { clampKey } from "../lib/opts";
import { presetMonogram } from "../lib/presets";
import { sanitizeOpts } from "../lib/sanitize";
import { rangeOf, specOf, type NumberOptKey } from "../lib/specs";
import { useSession } from "../lib/session";
import Button from "../components/Button";
import Field from "../components/Field";
import LabelRow from "../components/LabelRow";
import MoreSettings from "../components/MoreSettings";
import NudgeNumber from "../components/NudgeNumber";
import RadioChoices from "../components/RadioChoices";
import TextField from "../components/TextField";
import controls from "../styles/controls.module.css";
import layout from "./LivePage.module.css";
import styles from "./PresetsPage.module.css";

const F0_METHODS = ["rmvpe", "fcpe", "pm"] as const;

const KEY = specOf("key");
const KEY_RANGE = rangeOf("key");
const F0 = specOf("f0");
const BLOCK_TIME = specOf("blockTime");
const CROSSFADE_TIME = specOf("crossfadeTime");
const EXTRA_TIME = specOf("extraTime");

// The presets page: saved model profiles with artwork and last-used telemetry
// on the left stage, profile inspector and tuning controls in the right rack,
// and the shared process log along the bottom.
export default function PresetsPage() {
  const { running, logLines, clearLog, opts, presets, activePresetId, createPresetFromOpts, updatePreset, deletePreset, loadPreset } = useSession();

  const [selectedId, setSelectedId] = useState<string | null>(() => activePresetId ?? presets[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const trackerLabelId = useId();

  // Keep selection valid when presets are created or removed.
  const selectedPreset = presets.find((p) => p.id === selectedId) ?? presets.find((p) => p.id === activePresetId) ?? presets[0] ?? null;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const saveCurrentAsNew = () => {
    const created = createPresetFromOpts(opts);
    setSelectedId(created.id);
  };

  const patchSelectedOpts = (patch: Partial<InferenceOpts>) => {
    if (!selectedPreset) return;
    updatePreset(selectedPreset.id, {
      opts: sanitizeOpts({ ...selectedPreset.opts, ...patch }),
    });
  };

  const setSelectedNumber = (key: NumberOptKey, value: number) => {
    if (!selectedPreset) return;
    updatePreset(selectedPreset.id, {
      opts: sanitizeOpts({ ...selectedPreset.opts, [key]: value }, key),
    });
  };

  const chooseImage = async () => {
    if (!selectedPreset) return;
    const rvc = bridge();
    if (rvc) {
      const dataUrl = await rvc.browse("image");
      if (dataUrl) updatePreset(selectedPreset.id, { image: dataUrl });
      return;
    }
    imageInputRef.current?.click();
  };

  const onImageInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedPreset) return;
    const targetId = selectedPreset.id;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updatePreset(targetId, { image: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const filtered = presets.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || baseName(item.opts.model).toLowerCase().includes(q);
  });

  return (
    <div className={layout.live}>
      <section className={cx(layout.stage, styles.stage)} aria-label="Presets">
        <div className={styles.header}>
          <LabelRow
            as="span"
            label="Voice profiles"
            tip="Saved voice configurations with custom profile artwork and the settings from the last time each model was used."
          />
          <div className={styles.toolbar}>
            <input
              type="search"
              className={cx(controls.control, styles.search)}
              placeholder="Filter profiles"
              aria-label="Filter profiles"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button onClick={saveCurrentAsNew}>Save current</Button>
            <input ref={imageInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={onImageInput} />
          </div>
        </div>

        <div className={styles.grid}>
          {filtered.map((preset) => {
            const isSelected = selectedPreset?.id === preset.id;
            const isActive = activePresetId === preset.id;
            const modelName = baseName(preset.opts.model) || "No model";
            const pitchText = preset.opts.key > 0 ? `+${preset.opts.key}` : String(preset.opts.key);

            return (
              <button
                key={preset.id}
                type="button"
                className={styles.card}
                data-selected={isSelected ? "true" : undefined}
                data-active={isActive ? "true" : undefined}
                onClick={() => setSelectedId(preset.id)}
              >
                <div className={styles.cardTop}>
                  <div className={styles.portrait}>
                    {preset.image ? (
                      <img className={styles.portraitImg} src={preset.image} alt={preset.name} />
                    ) : (
                      <span className={styles.monogram} aria-hidden="true">
                        {presetMonogram(preset.name)}
                      </span>
                    )}
                  </div>
                  <div className={styles.cardMeta}>
                    <div className={styles.cardHead}>
                      <span className={styles.cardName}>{preset.name}</span>
                      {isActive && <span className={styles.badge}>Active</span>}
                    </div>
                    <span className={styles.cardModel}>{modelName}</span>
                  </div>
                </div>

                <div className={styles.telemetry}>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Block</span>
                    <span className={styles.metricValue}>{preset.opts.blockTime}s</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Pitch</span>
                    <span className={styles.metricValue}>{pitchText} st</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>F0</span>
                    <span className={styles.metricValue}>{preset.opts.f0.toUpperCase()}</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Index</span>
                    <span className={styles.metricValue}>{preset.opts.indexRate.toFixed(2)}</span>
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No saved profiles</p>
              <p className={styles.emptyNote}>
                Save your current Live configuration or start a live session to record a model profile with its last-used settings.
              </p>
              <Button onClick={saveCurrentAsNew}>Save current settings</Button>
            </div>
          )}
        </div>
      </section>

      <aside className={layout.rack}>
        <div className={layout.rackBody}>
          {selectedPreset ? (
            <>
              <h3 className={layout.group}>Profile</h3>
              <div className={styles.avatarRow}>
                <div className={styles.avatarWell}>
                  {selectedPreset.image ? (
                    <img className={styles.portraitImg} src={selectedPreset.image} alt={selectedPreset.name} />
                  ) : (
                    <span className={styles.monogram} aria-hidden="true">
                      {presetMonogram(selectedPreset.name)}
                    </span>
                  )}
                </div>
                <div className={styles.avatarActions}>
                  <Button onClick={() => void chooseImage()}>Choose image</Button>
                  {selectedPreset.image && (
                    <Button variant="text" onClick={() => updatePreset(selectedPreset.id, { image: "" })}>
                      Clear image
                    </Button>
                  )}
                </div>
              </div>

              <TextField
                label="Profile name"
                tip="Name shown on the preset card."
                value={selectedPreset.name}
                onChange={(name) => updatePreset(selectedPreset.id, { name })}
              />

              <h3 className={layout.group}>Last used settings</h3>
              <Field label={BLOCK_TIME.label} tip={BLOCK_TIME.tip}>
                <NudgeNumber
                  value={selectedPreset.opts.blockTime}
                  step={BLOCK_TIME.step}
                  min={BLOCK_TIME.min}
                  onChange={(n) => setSelectedNumber("blockTime", n)}
                />
              </Field>
              <Field label={CROSSFADE_TIME.label} tip={CROSSFADE_TIME.tip}>
                <NudgeNumber
                  value={selectedPreset.opts.crossfadeTime}
                  step={CROSSFADE_TIME.step}
                  min={CROSSFADE_TIME.min}
                  onChange={(n) => setSelectedNumber("crossfadeTime", n)}
                />
              </Field>
              <Field label={EXTRA_TIME.label} tip={EXTRA_TIME.tip}>
                <NudgeNumber
                  value={selectedPreset.opts.extraTime}
                  step={EXTRA_TIME.step}
                  min={EXTRA_TIME.min}
                  onChange={(n) => setSelectedNumber("extraTime", n)}
                />
              </Field>
              <Field label={KEY.label} tip={KEY.tip}>
                <NudgeNumber
                  value={selectedPreset.opts.key}
                  step={1}
                  min={KEY_RANGE.min}
                  max={KEY_RANGE.max}
                  onChange={(n) => patchSelectedOpts({ key: clampKey(n) })}
                />
              </Field>
              <Field id={trackerLabelId} label={F0.label} tip={F0.tip}>
                <RadioChoices
                  id={trackerLabelId}
                  name="preset-f0"
                  value={selectedPreset.opts.f0}
                  options={F0_METHODS}
                  onChange={(f0) => patchSelectedOpts({ f0 })}
                />
              </Field>

              <dl className={styles.specList}>
                <dt className={styles.specKey}>Model</dt>
                <dd className={styles.specVal}>{baseName(selectedPreset.opts.model) || "None"}</dd>
                <dt className={styles.specKey}>Index</dt>
                <dd className={styles.specVal}>{baseName(selectedPreset.opts.index) || "None"}</dd>
                <dt className={styles.specKey}>Index rate</dt>
                <dd className={styles.specVal}>{selectedPreset.opts.indexRate.toFixed(2)}</dd>
                <dt className={styles.specKey}>Loudness mix</dt>
                <dd className={styles.specVal}>{selectedPreset.opts.rmsMixRate.toFixed(2)}</dd>
              </dl>

              <div className={styles.rackActions}>
                <Button variant="text" onClick={() => updatePreset(selectedPreset.id, { opts, lastUsedAt: Date.now() })}>
                  Capture Live
                </Button>
                <Button variant="text" onClick={() => deletePreset(selectedPreset.id)}>
                  Delete profile
                </Button>
              </div>
            </>
          ) : (
            <>
              <h3 className={layout.group}>Profile</h3>
              <p className={styles.rackEmpty}>Select or save a profile to inspect its model, artwork, and last-used settings.</p>
            </>
          )}
        </div>

        {selectedPreset ? (
          <>
            <Button variant="more" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
              More settings
            </Button>
            <Button variant="start" running={activePresetId === selectedPreset.id} disabled={running} onClick={() => loadPreset(selectedPreset.id)}>
              {activePresetId === selectedPreset.id ? "Loaded" : "Load preset"}
            </Button>
          </>
        ) : (
          <Button variant="start" onClick={saveCurrentAsNew}>
            Save current
          </Button>
        )}
      </aside>

      <section className={layout.tape} aria-label="Logs">
        <div className={layout.tapeBar}>
          <h2>Logs</h2>
          <Button variant="text" className={layout.tapeAction} onClick={clearLog}>
            Clear
          </Button>
        </div>
        {logLines.length === 0 && <p className={layout.logEmpty}>Logs are displayed here.</p>}
        <pre id="log" className={layout.log} aria-live="polite" ref={logRef}>
          {logLines.join("\n")}
        </pre>
      </section>

      {moreOpen && selectedPreset && <MoreSettings opts={selectedPreset.opts} running={false} onPatch={patchSelectedOpts} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}
