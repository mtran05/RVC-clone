import { ReactNode } from "react";
import Field from "./Field";
import { useFieldId } from "./FieldContext";
import controls from "../styles/controls.module.css";

interface Props {
  label: string;
  tip: string;
  tipLabel?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  /** Applied on blur, for fields whose free text has a legal vocabulary. */
  normalize?: (value: string) => string;
  extra?: ReactNode;
  onChange: (value: string) => void;
}

// A single-line free-text setting, such as latency or the host API filter.
export default function TextField({ label, tip, tipLabel, value, placeholder, disabled, normalize, extra, onChange }: Props) {
  const id = useFieldId();

  return (
    <Field label={label} tip={tip} tipLabel={tipLabel} extra={extra}>
      <input
        id={id}
        className={controls.control}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => normalize && onChange(normalize(event.target.value))}
      />
    </Field>
  );
}
