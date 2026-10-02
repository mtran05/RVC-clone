import { ReactNode } from "react";
import TipButton from "./TipButton";

// Label row (label + "?" help button + optional output) above one control.
interface Props {
  id?: string;
  label: string;
  tip: string;
  tipLabel: string;
  extra?: ReactNode;
  children: ReactNode;
}

export default function Field({ id, label, tip, tipLabel, extra, children }: Props) {
  return (
    <div className="field">
      <div className="label-row">
        <label htmlFor={id}>{label}</label>
        <TipButton text={tip} label={tipLabel} />
        {extra}
      </div>
      {children}
    </div>
  );
}
