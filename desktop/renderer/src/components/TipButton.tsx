import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  label: string;
}

// The little "?" button next to a label. Toggles a floating explanation and
// closes on outside click or Escape.
export default function TipButton({ text, label }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} style={{ display: "contents" }}>
      <button
        type="button"
        className="tip-btn"
        ref={ref}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <p
          className="tip-pop"
          style={{ position: "fixed" }}
          role="tooltip"
          ref={(el) => {
            if (!el || !ref.current) return;
            const box = ref.current.getBoundingClientRect();
            el.style.left = `${Math.max(8, box.right - el.offsetWidth)}px`;
            el.style.top = `${Math.min(box.bottom + 6, window.innerHeight - el.offsetHeight - 8)}px`;
          }}
        >
          {text}
        </p>
      )}
    </span>
  );
}
