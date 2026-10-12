import type { ButtonHTMLAttributes } from "react";
import { cx } from "../lib/cx";
import styles from "./Button.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ghost" | "text" | "start" | "more";
  /** Lights the start button and gives it the "stop" role while converting. */
  running?: boolean;
}

// Every button in the app. `variant` picks the shape; `running` is a state, not
// a variant, so the same button reads as Start or Stop without swapping
// components.
export default function Button({ variant = "ghost", running, className, type = "button", ...rest }: Props) {
  return <button type={type} className={cx(styles[variant], className)} data-running={running ? "true" : undefined} {...rest} />;
}
