import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import styles from "./TipButton.module.css";

interface Props {
  text: string;
  /** Read out instead of the visible "?", so screen readers say something useful. */
  label: string;
}

// The little "?" button beside a label. Toggles a floating explanation and
// closes on an outside click or Escape.
export default function TipButton({ text, label }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The popup is position: fixed, so its coordinates have to be measured. Do it
  // after layout so the offsetWidth used below is the real one.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const pop = popRef.current;
    if (!open || !button || !pop) return;
    const box = button.getBoundingClientRect();
    const left = Math.max(8, box.right - pop.offsetWidth);
    const top = Math.min(box.bottom + 6, window.innerHeight - pop.offsetHeight - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }, [open]);

  return (
    <span ref={wrapRef} className={styles.wrap}>
      <button ref={buttonRef} type="button" className={styles.button} aria-expanded={open} aria-label={label} onClick={() => setOpen((wasOpen) => !wasOpen)}>
        ?
      </button>
      {open && (
        <p ref={popRef} role="tooltip" className={cx(styles.pop, styles.floating)}>
          {text}
        </p>
      )}
    </span>
  );
}
