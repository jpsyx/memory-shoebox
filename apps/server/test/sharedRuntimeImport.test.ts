import { describe, expect, it } from "vitest";
import {
  SETTING_DEFINITIONS,
  getSettingValueFromStoredValue,
} from "@memory-shoebox/shared";

/**
 * `docs/shared.md` says the server imports types only from the shared package,
 * because runtime imports of workspace TypeScript source are delicate under
 * Node's type stripping. `SETTING_DEFINITIONS` is the first runtime value the
 * server genuinely needs from it, so this test is the standing proof that the
 * import still works. If it ever fails, the fix is to move settings resolution
 * into `apps/server`, not to delete this test.
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
});
