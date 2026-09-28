import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TOKENS = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

/**
 * The custom properties declared inside one block, in source order.
 *
 * A rendition declares exactly the same properties as every other rendition,
 * which is what stops one shipping without its `--accent-on-print` and
 * silently inheriting another rendition's answer.
 */
function _propertiesIn(selector: string): readonly string[] {
  const start = TOKENS.indexOf(selector);
  if (start === -1) {
    throw new Error(`No block for ${selector} in tokens.css`);
  }
  const body = TOKENS.slice(
    TOKENS.indexOf("{", start) + 1,
    TOKENS.indexOf("}", start),
  );
  return [...body.matchAll(/^\s*(--[a-z-]+)\s*:/gm)].map((match) => {
    return match[1] ?? "";
  });
}

describe("the renditions", () => {
  const day = _propertiesIn('[data-rendition="day"]');

  it("declares nine properties on Day, the default", () => {
    expect(day).toHaveLength(9);
    expect(day).toContain("--accent-on-panel");
    expect(day).toContain("--accent-on-print");
  });

  it.each([
    '[data-rendition="porcelain"]',
    '[data-rendition="slate"]',
    '[data-rendition="night"]',
  ])("declares the same properties on %s", (selector) => {
    expect([..._propertiesIn(selector)].sort()).toEqual([...day].sort());
  });

  it("declares the same properties on the dark block", () => {
    const dark = _propertiesIn(":root:not([data-rendition])");
    expect([...dark].sort()).toEqual([...day].sort());
  });

  it("tells the browser the dark block is dark", () => {
    const start = TOKENS.indexOf(":root:not([data-rendition])");
    const block = TOKENS.slice(start, TOKENS.indexOf("}", start));
    expect(block).toContain("color-scheme: dark");
  });
});
