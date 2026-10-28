import { createContext, useContext, useId } from "react";

// A Field hands its generated id to whichever control it wraps, so a caller
// writes `<Field label=...><NudgeNumber ... /></Field>` instead of repeating
// the same id in both places.
const FieldIdContext = createContext<string | undefined>(undefined);

export const FieldIdProvider = FieldIdContext.Provider;

// An explicit id always wins; otherwise use the enclosing Field's id, or a
// fresh one for components that render their own Field.
export function useFieldId(explicit?: string): string {
  const contextId = useContext(FieldIdContext);
  const generated = useId();
  return explicit ?? contextId ?? generated;
}
