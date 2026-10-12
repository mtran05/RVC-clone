import { useFieldId } from "./FieldContext";
import styles from "./RangeField.module.css";

interface Props {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  ariaLabel?: string;
  /** Style tweaks the track and thumb, such as the tall pitch dial. */
  variant?: "default" | "dial";
  onChange: (value: number) => void;
}

// A slider. The filled portion is painted through the --pct custom property
// that the track rule reads; custom properties are not namespaced by CSS
// modules, so this inline value reaches the stylesheet untouched.
export default function RangeField({ id, value, min, max, step, disabled, ariaLabel, variant = "default", onChange }: Props) {
  const fieldId = useFieldId(id);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <input
      id={fieldId}
      className={variant === "dial" ? styles.dial : styles.slider}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      data-shift={variant === "dial" && value !== 0 ? "true" : undefined}
      style={{ "--pct": `${pct}%` } as React.CSSProperties}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}
