// Last path segment of a Windows or POSIX path. The dropdowns show these, while
// the full path is what the inference process needs.
export function baseName(file: string): string {
  return String(file).split(/[/\\]/).pop() ?? file;
}
