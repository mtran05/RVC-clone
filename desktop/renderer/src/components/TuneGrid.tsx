import type { InferenceOpts } from "../lib/bridge";
import { sanitizeOpts } from "../lib/sanitize";
import { legalLatency } from "../lib/opts";
import { specOf, type NumberOptKey, type OptKey, type TuneSection } from "../lib/specs";
import CheckField from "./CheckField";
import Field from "./Field";
import NudgeNumber from "./NudgeNumber";
import TextField from "./TextField";
import styles from "./TuneGrid.module.css";

interface Props {
  section: TuneSection;
  opts: InferenceOpts;
  disabled?: boolean;
  onPatch: (patch: Partial<InferenceOpts>) => void;
}

/** One grid item per kind of control. */
type Slot = { kind: "checks"; keys: OptKey[] } | { kind: "text"; key: OptKey } | { kind: "number"; key: NumberOptKey };

// Runs of toggles read as one row of switches rather than one per column, so
// they are gathered into a single item.
function toSlots(section: TuneSection): Slot[] {
  const slots: Slot[] = [];
  for (const key of section.fields) {
    const kind = specOf(key).kind;
    if (kind === "bool") {
      const last = slots[slots.length - 1];
      if (last && last.kind === "checks") last.keys.push(key);
      else slots.push({ kind: "checks", keys: [key] });
    } else if (kind === "string") {
      slots.push({ kind: "text", key });
    } else {
      slots.push({ kind: "number", key: key as NumberOptKey });
    }
  }
  return slots;
}

// One titled group of settings inside the More settings sheet. Each field picks
// the control its spec calls for, so the whole modal is a table of option keys.
export default function TuneGrid({ section, opts, disabled, onPatch }: Props) {
  // Numbers go through sanitizeOpts so the coupled pitch bounds behave the same
  // wherever they are edited.
  const setNumber = (key: NumberOptKey, value: number) => onPatch(sanitizeOpts({ ...opts, [key]: value }, key));

  return (
    <section>
      <h3>{section.title}</h3>
      <div className={styles.bunch}>
        {toSlots(section).map((slot) => {
          if (slot.kind === "checks") {
            return (
              <div key={slot.keys.join()} className={styles.checks}>
                {slot.keys.map((key) => (
                  <CheckField
                    key={key}
                    label={specOf(key).label}
                    tip={specOf(key).tip}
                    checked={Boolean(opts[key])}
                    disabled={disabled}
                    onChange={(checked) => onPatch({ [key]: checked })}
                  />
                ))}
              </div>
            );
          }

          if (slot.kind === "text") {
            const spec = specOf(slot.key);
            return (
              <TextField
                key={slot.key}
                label={spec.label}
                tip={spec.tip}
                value={String(opts[slot.key])}
                placeholder={spec.placeholder}
                disabled={disabled}
                normalize={slot.key === "latency" ? legalLatency : undefined}
                onChange={(text) => onPatch({ [slot.key]: text })}
              />
            );
          }

          const spec = specOf(slot.key);
          return (
            <Field key={slot.key} label={spec.label} tip={spec.tip}>
              <NudgeNumber step={spec.step} min={spec.min} value={Number(opts[slot.key])} disabled={disabled} onChange={(n) => setNumber(slot.key, n)} />
            </Field>
          );
        })}
      </div>
    </section>
  );
}
