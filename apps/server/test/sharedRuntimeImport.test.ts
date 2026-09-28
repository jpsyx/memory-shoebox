import { describe, expect, it } from "vitest";
import {
  SETTING_DEFINITIONS,
  createSessionRequestSchema,
  getSettingValueFromStoredValue,
} from "@memory-shoebox/shared";

/**
 * The standing guard behind `docs/shared.md` § The constraint worth knowing.
 *
 * The server loads this package's TypeScript through Node's type stripping,
 * so anything imported at runtime must contain nothing that needs code
 * emitted for it. This test covers both shapes the server imports: a
 * registry value and a route's schema.
 *
 * If it fails, the package has grown something that does not survive
 * stripping. Find that construct rather than deleting this test.
 */
describe("runtime imports from @memory-shoebox/shared", () => {
  it("loads a runtime value, not just a type", () => {
    expect(Object.keys(SETTING_DEFINITIONS)).toContain("shoebox.name");
  });

  it("runs code from the package", () => {
    expect(getSettingValueFromStoredValue("shoebox.name", undefined)).toBe(
      "My Shoebox",
    );
  });

  it("runs a route's request schema, the import every route now makes", () => {
    expect(
      createSessionRequestSchema.parse({
        email: "Someone@Example.com ",
        code: "000042",
      }),
    ).toEqual({ email: "someone@example.com", code: "000042" });
  });
});
