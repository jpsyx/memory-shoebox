import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const APPS_DIRECTORY = join(import.meta.dirname, "..", "..");

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".tanstack"]);

const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".css",
  ".json",
  ".html",
  ".js",
]);

/**
 * Anything that would pull code or styles in, as opposed to citing them.
 *
 * `apps/server` names `prototypes/src/surfaces/Emails.tsx` in a doc comment
 * and is right to: it is where the plain-text wrap width came from. The rule
 * in `AGENTS.md` is about importing, so these patterns are about importing.
 */
const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+["'][^"']*prototypes[^"']*["']/,
  /\bimport\s+["'][^"']*prototypes[^"']*["']/,
  /\brequire\(\s*["'][^"']*prototypes[^"']*["']/,
  /@import\s+(?:url\()?\s*["'][^"']*prototypes[^"']*["']/,
  /@memory-shoebox\/prototypes/,
];

/** Every scannable file under `apps/`, ignoring build output and packages. */
function _filesUnder(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (SKIPPED_DIRECTORIES.has(entry)) {
      return [];
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return _filesUnder(path);
    }
    return SCANNED_EXTENSIONS.has(extname(path)) ? [path] : [];
  });
}

describe("the prototypes boundary", () => {
  it("is not crossed by anything under apps/", () => {
    const offenders = _filesUnder(APPS_DIRECTORY).filter((path) => {
      if (path === join(import.meta.dirname, "boundaries.test.ts")) {
        return false;
      }
      const contents = readFileSync(path, "utf8");
      return IMPORT_PATTERNS.some((pattern) => {
        return pattern.test(contents);
      });
    });

    expect(offenders).toEqual([]);
  });
});
