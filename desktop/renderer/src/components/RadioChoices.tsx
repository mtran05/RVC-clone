import { cx } from "../lib/cx";
import { useFieldId } from "./FieldContext";
import styles from "./RadioChoices.module.css";

interface Props<T extends string = string> {
  id?: string;
  name: string;
  value: T;
  options: readonly T[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

// A segmented row of mutually exclusive choices. The inputs are hidden rather
// than styled away, so keyboard focus and screen readers still work; the chip
// is the label.
export default function RadioChoices<T extends string>({ id, name, value, options, disabled, onChange }: Props<T>) {
  const groupId = useFieldId(id);

  return (
    <div className={styles.choices} role="radiogroup" aria-labelledby={groupId}>
      {options.map((option) => (
        <label key={option} className={cx(styles.chip, option === value && styles.on)} data-off={disabled ? "true" : undefined}>
          <input type="radio" name={name} value={option} checked={option === value} disabled={disabled} onChange={() => onChange(option)} />
          {option.toUpperCase()}
        </label>
      ))}
    </div>
  );
}
