import { describe, expect, it } from "vitest";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";

describe("makeSafeHrefFromRedirect", () => {
  it("returns a path on this origin unchanged", () => {
    expect(makeSafeHrefFromRedirect("/items/abc?find=true")).toBe(
      "/items/abc?find=true",
    );
  });

  it("returns a bare slash unchanged", () => {
    expect(makeSafeHrefFromRedirect("/")).toBe("/");
  });

  it("lands on the pile when there is nowhere to go back to", () => {
    expect(makeSafeHrefFromRedirect(undefined)).toBe("/");
  });

  it("refuses anywhere but this origin", () => {
    for (const hostile of [
      "//evil.example.com",
      "https://evil.example.com/items",
      "javascript:alert(1)",
      "items/abc",
      // A backslash in the second position folds into a forward slash under
      // WHATWG URL parsing for an http or https URL, so it resolves exactly
      // as "//evil.example.com" does.
      "/\\evil.example.com",
      "/\\\\evil.example.com",
      "HTTPS://evil.example.com",
      `java\tscript:alert(1)`,
      " //evil.example.com",
    ]) {
      expect(makeSafeHrefFromRedirect(hostile)).toBe("/");
    }
  });
});
