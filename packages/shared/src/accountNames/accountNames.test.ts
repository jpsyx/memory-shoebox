import { describe, expect, it } from "vitest";
import * as shared from "../index.ts";

const { accountNameSchema, makeAccountNameKeyFromName } = shared;

describe("account name comparison keys", () => {
  it("trims, collapses whitespace and lowercases multiword names", () => {
    expect(makeAccountNameKeyFromName("  JoHN   M ")).toBe("john m");
  });

  it("composes accents into NFC without folding them away", () => {
    expect(makeAccountNameKeyFromName("Sofi\u0301a")).toBe("sofía");
    expect(makeAccountNameKeyFromName("Sofia")).not.toBe("sofía");
  });

  it("uses Unicode lowercase without locale-specific casing", () => {
    expect(makeAccountNameKeyFromName("I İ")).toBe("i i\u0307");
  });
});

describe("account name validation", () => {
  it("returns normalized display spelling with case and accents preserved", () => {
    expect(accountNameSchema.parse("  Sofi\u0301a\t  M\u00a0 ")).toBe(
      "Sofía M",
    );
  });

  it("measures the normalized display name against the existing limit", () => {
    expect(accountNameSchema.parse(`  ${"a".repeat(80)}  `)).toBe(
      "a".repeat(80),
    );
    expect(accountNameSchema.parse("e\u0301".repeat(80))).toBe("é".repeat(80));
  });

  it.each([
    ["an at sign", "@John"],
    ["an empty name", ""],
    ["a whitespace-only name", " \t\u00a0 "],
    ["null", null],
    ["81 characters", "a".repeat(81)],
    ["an internal newline", "John\nM"],
    ["a leading newline", "\nJohn"],
    ["a carriage return", "John\rM"],
    ["a vertical tab", "John\vM"],
    ["a form feed", "John\fM"],
    ["a next-line control", "John\u0085M"],
    ["a line separator", "John\u2028M"],
    ["a paragraph separator", "John\u2029M"],
    ["a zero-width space", "Jo\u200bhn"],
    ["a bidirectional formatting control", "Jo\u202ehn"],
    ["a leading byte-order mark", "\ufeffJohn"],
    ["a soft hyphen", "Jo\u00adhn"],
  ])("rejects %s before whitespace normalization", (_description, name) => {
    expect(accountNameSchema.safeParse(name).success).toBe(false);
  });
});
