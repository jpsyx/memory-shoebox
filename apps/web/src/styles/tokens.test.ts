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
  return _declarationsIn(selector).map((declaration) => {
    return declaration.property;
  });
}

/** Both halves of every custom property declared inside one block. */
function _declarationsIn(
  selector: string,
): ReadonlyArray<{ property: string; value: string }> {
  const start = TOKENS.indexOf(selector);
  if (start === -1) {
    throw new Error(`No block for ${selector} in tokens.css`);
  }
  const body = TOKENS.slice(
    TOKENS.indexOf("{", start) + 1,
    TOKENS.indexOf("}", start),
  );
  return [...body.matchAll(/^\s*(--[a-z-]+)\s*:\s*([^;]+);/gm)].map((match) => {
    return { property: match[1] ?? "", value: (match[2] ?? "").trim() };
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

  /*
   * The dark block copies Night's four inks rather than referencing them,
   * because a rendition declares its own. Copying is what makes drift
   * possible: edit Night's accent for contrast, forget the copy, and the two
   * still declare the same nine properties, so a name-only check stays green
   * while everybody on `prefers-color-scheme: dark` and no attribute sees the
   * old colour. This is the check that notices.
   */
  it("carries exactly Night's values, which it copies rather than cites", () => {
    expect(_declarationsIn(":root:not([data-rendition])")).toEqual(
      _declarationsIn('[data-rendition="night"]'),
    );
  });
});
