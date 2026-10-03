import { describe, expect, it } from "vitest";
import { makeNameKeyFromName } from "@/system/PeopleField/nameKey/nameKey";

/** A combining acute accent: "í" written as "i" and this, in two parts. */
const COMBINING_ACUTE = String.fromCodePoint(0x0301);

describe("makeNameKeyFromName", () => {
  it("reads a name trimmed, composed and in any case as one key", () => {
    expect(makeNameKeyFromName(`  Sofi${COMBINING_ACUTE}a `)).toBe(
      makeNameKeyFromName("SOFÍA"),
    );
  });
});
