import { ReactNode } from "react";
import Field from "./Field";
import { useFieldId } from "./FieldContext";
import controls from "../styles/controls.module.css";
import styles from "./SelectField.module.css";

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  tip: string;
  tipLabel?: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  extra?: ReactNode;
  /** Rendered after the dropdown, e.g. a Browse button. */
  aside?: ReactNode;
  onChange: (value: string) => void;
}

// A dropdown with a label row above it and an optional control beside it.
export default function SelectField({ label, tip, tipLabel, value, options, disabled, extra, aside, onChange }: Props) {
  const id = useFieldId();

  return (
    <Field id={id} label={label} tip={tip} tipLabel={tipLabel} extra={extra}>
      <div className={styles.row}>
        <select id={id} className={controls.select} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {aside}
      </div>
    </Field>
  );
}
