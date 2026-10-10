import { ReactNode, useId } from "react";
import LabelRow from "./LabelRow";
import { FieldIdProvider } from "./FieldContext";
import styles from "./Field.module.css";

interface Props {
  /** Optional. One is generated when omitted; either way children get it. */
  id?: string;
  label: string;
  tip: string;
  tipLabel?: string;
  extra?: ReactNode;
  children: ReactNode;
}

// A label row above one control. The control does not need to repeat the id:
// it reads it from context and wires itself up.
export default function Field({ id, label, tip, tipLabel, extra, children }: Props) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className={styles.field}>
      <LabelRow label={label} tip={tip} tipLabel={tipLabel} htmlFor={fieldId} extra={extra} />
      <FieldIdProvider value={fieldId}>{children}</FieldIdProvider>
    </div>
  );
}
