import { createContext, useContext } from "react";

// A Field hands its generated id to whichever control it wraps, so a caller
// writes `<Field label=...><NudgeNumber ... /></Field>` instead of repeating
// the same id in both places.
const FieldIdContext = createContext<string | undefined>(undefined);

export const FieldIdProvider = FieldIdContext.Provider;

// An explicit id always wins, so tests and deep links keep working.
export function useFieldId(explicit?: string): string | undefined {
  return useContext(FieldIdContext) ?? explicit;
}
