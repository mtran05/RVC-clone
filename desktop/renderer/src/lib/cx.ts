// Joins CSS-module class names, dropping anything falsy. Lets a component say
// `cx(styles.row, isOpen && styles.open)` without touching the module object by
// hand at every call site.
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
