import { useState } from "react";
import { legalNumber } from "../lib/opts";
import { useFieldId } from "./FieldContext";
import controls from "../styles/controls.module.css";
import { cx } from "../lib/cx";
import styles from "./NudgeNumber.module.css";

interface Props {
  id?: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  onChange: (value: number) => void;
}

// Number field with minus/plus steppers on either side.
// A local draft string is kept while typing so partial input like "0." or "-"
// is not reset to 0 before the user finishes.
export default function NudgeNumber({ id, value, step = 1, min, max, disabled, className, ariaLabel, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const fieldId = useFieldId(id);

  const nudge = (direction: number) => {
    // legalNumber snaps to the step's precision, avoiding float noise like 1.4000000000000004.
    const next = legalNumber((Number.isFinite(value) ? value : 0) + direction * step, { step, min, max, fallback: value });
    setDraft(null);
    onChange(next);
  };

  // Typed input is only accepted once it is legal: integer counts, step-aligned
  // values, and inside min/max. Falls back to the last good value if invalid.
  const commit = () => {
    if (draft != null) onChange(legalNumber(Number(draft), { step, min, max, fallback: value }));
    setDraft(null);
  };

  return (
    <div className={styles.nudge}>
      <button type="button" className={styles.step} aria-label="Decrease" disabled={disabled} onClick={() => nudge(-1)}>
        −
      </button>
      <input
        id={fieldId}
        className={cx(controls.control, styles.input, className)}
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft ?? (Number.isFinite(value) ? value : "")}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const parsed = Number(text);
          if (text.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
        }}
        onKeyDown={(event) => {
          // Enter records the typed value (snapped to step, clamped) immediately.
          if (event.key === "Enter") {
            commit();
            event.currentTarget.blur();
          }
        }}
        onBlur={commit}
      />
      <button type="button" className={styles.step} aria-label="Increase" disabled={disabled} onClick={() => nudge(1)}>
        +
      </button>
    </div>
  );
}
