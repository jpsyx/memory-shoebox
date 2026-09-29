import { describe, expect, it } from "vitest";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";

describe("makeSafeHrefFromRedirect", () => {
  it("returns a path on this origin unchanged", () => {
    expect(makeSafeHrefFromRedirect("/items/abc?find=true")).toBe(
      "/items/abc?find=true",
    );
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
    ]) {
      expect(makeSafeHrefFromRedirect(hostile)).toBe("/");
    }
  });
});
