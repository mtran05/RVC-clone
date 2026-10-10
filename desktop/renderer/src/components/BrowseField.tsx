import { bridge } from "../lib/bridge";
import { baseName } from "../lib/format";
import Button from "./Button";
import SelectField from "./SelectField";
import styles from "./BrowseField.module.css";

interface Props {
  /** Which file the picker opens for; also decides the accepted extension. */
  kind: "model" | "index";
  label: string;
  tip: string;
  placeholder: string;
  value: string;
  /** Paths discovered under assets/, plus anything browsed in this session. */
  options: string[];
  disabled?: boolean;
  /** Called with a newly browsed path so the caller can add it to `options`. */
  onBrowse: (path: string) => void;
  onChange: (path: string) => void;
}

// A model or index picker: a dropdown of what is already on disk, plus a button
// that opens the file dialog for anything else.
export default function BrowseField({ kind, label, tip, placeholder, value, options, disabled, onBrowse, onChange }: Props) {
  // A path the user browsed to stays selectable even when it lives outside
  // assets/, so it is offered alongside the scanned list.
  const choices = value && !options.includes(value) ? [value, ...options] : options;

  const browse = async () => {
    const file = await bridge()?.browse(kind);
    if (!file) return;
    onBrowse(file);
    onChange(file);
  };

  return (
    <SelectField
      label={label}
      tip={tip}
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={[{ value: "", label: placeholder }, ...choices.map((path) => ({ value: path, label: baseName(path) }))]}
      aside={
        <Button className={styles.browse} disabled={disabled} onClick={browse}>
          Browse
        </Button>
      }
    />
  );
}
