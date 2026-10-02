import { useState } from "react";
import { legalNumber } from "../lib/opts";

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

  const nudge = (dir: number) => {
    // legalNumber snaps to the step's precision, avoiding float noise like 1.4000000000000004.
    const next = legalNumber((Number.isFinite(value) ? value : 0) + dir * step, step, min ?? null, max ?? null, value);
    setDraft(null);
    onChange(next);
  };

  // Typed input is only accepted once it is legal: integer counts, step-aligned
  // values, and inside min/max. Falls back to the last good value if invalid.
  const commit = () => {
    if (draft != null) {
      const n = Number(draft);
      const legal = legalNumber(n, step, min ?? null, max ?? null, value);
      onChange(legal);
    }
    setDraft(null);
  };

  return (
    <div className="nudge">
      <button type="button" className="step" aria-label="Decrease" disabled={disabled} onClick={() => nudge(-1)}>
        −
      </button>
      <input
        id={id}
        className={className ?? "control"}
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft ?? (Number.isFinite(value) ? value : "")}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const n = Number(text);
          if (text.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
        onKeyDown={(e) => {
          // Enter records the typed value (snapped to step, clamped) immediately.
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
        }}
        onBlur={commit}
      />
      <button type="button" className="step" aria-label="Increase" disabled={disabled} onClick={() => nudge(1)}>
        +
      </button>
    </div>
  );
}
