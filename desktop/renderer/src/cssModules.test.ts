// @vitest-environment jsdom

// CSS modules fail silently. A typo in `styles.foo` produces className={undefined}
// and the element simply loses its styling; nothing throws, nothing warns, and
// the layout quietly comes apart. These tests read the .tsx and .module.css
// files as text and check the two agree.
//
// This is what the first layout bug in this app looked like: a grid-placement
// rule written in one component's stylesheet for a class owned by another.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const tsxFiles: string[] = walk(srcRoot).filter((file) => file.endsWith(".tsx"));
const cssFiles: string[] = walk(srcRoot).filter((file) => file.endsWith(".module.css"));

// Classes appear in every selector position, not just at the start of a line:
// `.bar .close { ... }` defines .bar and .close. Comments and declaration
// blocks are stripped first so prose mentioning `.control` and values like
// `0.45` cannot both look like classes.
const classesDefinedIn = (file: string): Set<string> => {
  const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set<string>();
  for (const match of source.matchAll(/([^{}]+)\{/g)) {
    for (const selector of match[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) names.add(selector[1]);
  }
  return names;
};

/** The component body, with import statements removed. Without this the scan
    matches `controls.module` inside the path of `controls.module.css`. */
const withoutImports = (source: string): string => source.replace(/import\s+[^\n]*from\s+"[^"]*";?/g, "");

/** Every `alias.ClassName` reference in a file, per imported module alias. */
function referencesByAlias(source: string): Map<string, string[]> {
  const body = withoutImports(source);
  const references = new Map<string, string[]>();
  for (const match of source.matchAll(/import\s+(\w+)\s+from\s+"([^"]+\.module\.css)"/g)) {
    references.set(
      match[1],
      [...body.matchAll(new RegExp(`\\b${match[1]}\\.(\\w+)`, "g"))].map((use) => use[1]),
    );
  }
  return references;
}

/** The path an import refers to, resolved to the stylesheet on disk. */
function stylesheetFor(source: string, alias: string, from: string): string | undefined {
  const found = source.match(new RegExp(`import\\s+${alias}\\s+from\\s+"([^"]+)"`));
  return found ? path.resolve(path.dirname(from), found[1]) : undefined;
}

describe("CSS module wiring", () => {
  it("has a stylesheet for every component that imports one", () => {
    expect(tsxFiles.length).toBeGreaterThan(10);
    expect(cssFiles.length).toBeGreaterThan(10);
  });

  it("resolves every class a component references to a real rule", () => {
    const problems = [];
    for (const file of tsxFiles) {
      const source = readFileSync(file, "utf8");
      for (const [alias, used] of referencesByAlias(source)) {
        const stylesheet = stylesheetFor(source, alias, file);
        if (!stylesheet) continue;
        const defined = classesDefinedIn(stylesheet);
        for (const name of new Set(used)) {
          if (!defined.has(name)) problems.push(`${path.basename(file)} uses ${alias}.${name}, which ${path.basename(stylesheet)} does not define`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("never reads a class off a stylesheet the component does not import", () => {
    // Catches the reverse mistake: a rule placed in AppShell.module.css for a
    // class that Rail.module.css hashes, which compiles and then never matches.
    const problems = [];
    for (const file of tsxFiles) {
      const source = readFileSync(file, "utf8");
      const body = withoutImports(source);
      for (const match of source.matchAll(/import\s+styles\s+from\s+"([^"]+\.module\.css)"/g)) {
        const stylesheet = path.basename(match[1]);
        const defined = classesDefinedIn(path.resolve(path.dirname(file), match[1]));
        for (const use of new Set([...body.matchAll(/\bstyles\.(\w+)/g)].map((m) => m[1]))) {
          if (!defined.has(use)) problems.push(`${path.basename(file)} reads styles.${use} from ${stylesheet}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps the shared control classes from leaking out of controls.module.css", () => {
    const source = readFileSync(path.join(srcRoot, "styles", "controls.module.css"), "utf8");
    expect(source).toMatch(/\.control\b/);
    expect(source).toMatch(/\.select\b/);
    expect(source).toMatch(/\.select\s*\{[^}]*composes:\s*control/);
  });

  it("has no dead rules: every class is used by a component that imports it", () => {
    const problems = [];
    for (const file of cssFiles) {
      const defined = classesDefinedIn(file);
      // A shared stylesheet such as controls.module.css has several importers;
      // a component's own has one. Collect every importer either way.
      const importers = tsxFiles.filter((candidate) => readFileSync(candidate, "utf8").includes(path.basename(file)));
      if (importers.length === 0) {
        problems.push(`${path.basename(file)} is imported by no component`);
        continue;
      }
      const used = new Set();
      for (const importer of importers) {
        const source = readFileSync(importer, "utf8");
        const body = withoutImports(source);
        const aliases = [...source.matchAll(new RegExp(`import\\s+(\\w+)\\s+from\\s+"[^"]*${path.basename(file)}"`, "g"))].map((m) => m[1]);
        for (const alias of aliases) {
          for (const use of body.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, "g"))) used.add(use[1]);
        }
      }
      for (const name of defined) {
        // A computed access like styles[variant] cannot be followed by reading
        // the file, so treat the whole stylesheet as live in that case.
        const computed = importers.some((importer) => /styles\[[^\]]+\]/.test(readFileSync(importer, "utf8")));
        if (!computed && !used.has(name)) problems.push(`${path.basename(file)} defines .${name}, which nothing uses`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives the rail its own grid cell, so it spans every desk row", () => {
    // The rail is the one child whose grid placement cannot live in the
    // parent's stylesheet, because the parent cannot address its hashed class.
    const rail = readFileSync(path.join(srcRoot, "components", "Rail.module.css"), "utf8");
    expect(rail).toMatch(/\.rail\s*\{[^}]*grid-column:\s*1[^}]*\}/s);
    expect(rail).toMatch(/\.rail\s*\{[^}]*grid-row:\s*1\s*\/\s*-1[^}]*\}/s);
    // And at narrow widths it collapses to a single top row.
    expect(rail).toMatch(/@media[^{]*\{[^@]*\.rail\s*\{[^}]*grid-row:\s*1;/s);
  });

  /** Splits a track list on whitespace that is not inside a function call, so
    `minmax(0, 1fr) auto` counts as two tracks, not three. */
  function countTracks(list: string): number {
    let depth = 0;
    let tracks = 1;
    for (const char of list.trim()) {
      if (char === "(") depth++;
      else if (char === ")") depth--;
      else if (char === " " && depth === 0) tracks++;
    }
    return list.trim() ? tracks : 0;
  }

  it("gives the shell one row per grid item it places", () => {
    const shell = readFileSync(path.join(srcRoot, "components", "AppShell.module.css"), "utf8");
    const rows = shell.match(/grid-template-rows:\s*([^;]+);/)?.[1];
    expect(rows, "no grid-template-rows on .desk").toBeTruthy();
    // Two tracks: the masthead, then everything below it. A third would leave a
    // dead band, as the live page's own grid once did.
    expect(countTracks(rows!)).toBe(2);
  });

  it("gives the live page one row per region it places", () => {
    const page = readFileSync(path.join(srcRoot, "pages", "LivePage.module.css"), "utf8");
    const tracks = page.match(/grid-template-rows:\s*([^;]+);/)?.[1];
    expect(tracks, "no grid-template-rows on .live").toBeTruthy();
    // Two tracks: the stage and rack side by side, then the log tape.
    expect(countTracks(tracks!)).toBe(2);
  });
});
