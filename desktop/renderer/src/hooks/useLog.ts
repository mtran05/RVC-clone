import { useCallback, useState } from "react";

// The process log is the only thing that grows without bound while the app is
// open, so the buffer is capped. A dropped line is better than a window that
// stops responding after an hour of live conversion.
const LOG_LIMIT = 80;

export function useLog() {
  const [lines, setLines] = useState<string[]>([]);

  const push = useCallback((line: string) => {
    setLines((current) => [...current.slice(-(LOG_LIMIT - 1)), line]);
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, push, clear };
}
