import { describe, expect, it } from "vitest";
import {
  createSignInCodeDigits,
  isMatchingCodeHash,
  makeCodeHashFromDigits,
} from "../../src/auth/signInCodeHelpers.ts";

const PEPPER = Buffer.from("a".repeat(64), "hex");
const OTHER_PEPPER = Buffer.from("b".repeat(64), "hex");

describe("createSignInCodeDigits", () => {
  it("is always exactly six digits, including the low ones", () => {
    const codes = Array.from({ length: 200 }, () => {
      return createSignInCodeDigits();
    });
    codes.forEach((code) => {
      expect(code).toMatch(/^\d{6}$/);
    });
  });

  it("does not repeat itself over two hundred draws", () => {
    const codes = new Set(
      Array.from({ length: 200 }, () => {
        return createSignInCodeDigits();
      }),
    );
    expect(codes.size).toBeGreaterThan(150);
  });
});

describe("makeCodeHashFromDigits", () => {
  it("is stable for the same digits and pepper", () => {
    expect(makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER })).toBe(
      makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER }),
    );
  });

  it("is not the digits, and is not a bare SHA-256 of them", () => {
    const hash = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    expect(hash).not.toContain("410233");
    expect(hash).not.toBe(
      makeCodeHashFromDigits({ digits: "410233", pepper: OTHER_PEPPER }),
    );
  });
});

describe("isMatchingCodeHash", () => {
  it("accepts two hashes of the same digits", () => {
    const stored = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    const submitted = makeCodeHashFromDigits({
      digits: "410233",
      pepper: PEPPER,
    });
    expect(isMatchingCodeHash({ leftHash: stored, rightHash: submitted })).toBe(
      true,
    );
  });

  it("rejects a different code", () => {
    const stored = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    const submitted = makeCodeHashFromDigits({
      digits: "000000",
      pepper: PEPPER,
    });
    expect(isMatchingCodeHash({ leftHash: stored, rightHash: submitted })).toBe(
      false,
    );
  });

  it("returns false rather than throwing on a malformed stored hash", () => {
    const stored = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    expect(isMatchingCodeHash({ leftHash: "not-hex", rightHash: stored })).toBe(
      false,
    );
  });
});
