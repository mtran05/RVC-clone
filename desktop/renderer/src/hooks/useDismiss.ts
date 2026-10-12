import { useEffect } from "react";

// Closes whatever is open on Escape. Used by Modal and, separately, TipButton.
export function useDismiss(onDismiss: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);
}
