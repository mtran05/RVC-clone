import { ReactNode } from "react";
import TipButton from "./TipButton";
import styles from "./LabelRow.module.css";

interface Props {
  label: string;
  tip: string;
  /** Overrides the derived "About <label>", for labels the sentence reads badly on. */
  tipLabel?: string;
  /** Put on the name element. Share it with a control that needs to name itself. */
  id?: string;
  /** Only meaningful for `as="label"`, which points at the control's id. */
  htmlFor?: string;
  as?: "label" | "legend" | "span";
  extra?: ReactNode;
}

// The row above a control: its name, a help button, and an optional readout
// pushed to the far end.
export default function LabelRow({ label, tip, tipLabel, id, htmlFor, as = "label", extra }: Props) {
  const name =
    as === "legend" ? (
      <legend id={id} className={styles.name}>
        {label}
      </legend>
    ) : as === "span" ? (
      <span id={id} className={styles.name}>
        {label}
      </span>
    ) : (
      <label id={id} className={styles.name} htmlFor={htmlFor}>
        {label}
      </label>
    );

  return (
    <div className={styles.row}>
      {name}
      <TipButton text={tip} label={tipLabel ?? `About ${label}`} />
      {extra}
    </div>
  );
}
