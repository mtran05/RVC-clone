import TipButton from "./TipButton";
import { useFieldId } from "./FieldContext";
import styles from "./CheckField.module.css";

interface Props {
  label: string;
  tip: string;
  tipLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

// A checkbox with its help button beside it, on one line. Unlike the other
// fields the checkbox's own label is the text, so there is no label row above.
export default function CheckField({ label, tip, tipLabel, checked, disabled, onChange }: Props) {
  const id = useFieldId();

  return (
    <div className={styles.row}>
      <label className={styles.check} htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
      <TipButton text={tip} label={tipLabel ?? `About ${label}`} />
    </div>
  );
}
