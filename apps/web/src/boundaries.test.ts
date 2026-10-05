import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_APP_DIRECTORY = join(import.meta.dirname, "..");

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".tanstack"]);

const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".css",
  ".json",
  ".html",
  ".js",
]);

/** Production modules must not import test fixtures. */
const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+["'][^"']*e2e\/fixtures[^"']*["']/,
  /\bimport\s+["'][^"']*e2e\/fixtures[^"']*["']/,
  /\brequire\(\s*["'][^"']*e2e\/fixtures[^"']*["']/,
  /@import\s+(?:url\()?\s*["'][^"']*e2e\/fixtures[^"']*["']/,
];

/** Every scannable file under `apps/web`, minus build output and packages. */
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

describe("the browser fixture boundary", () => {
  it("is not crossed by anything under apps/web/", () => {
    const offenders = _filesUnder(WEB_APP_DIRECTORY).filter((path) => {
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
