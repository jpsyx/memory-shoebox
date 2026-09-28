import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `rendering.test.tsx` navigates to every surface and would fail if one
// were missing or misplaced. This file checks the structural boundary
// between the guarded shell and sign-in, which rendering alone does not.
describe("the route tree", () => {
  it("keeps sign-in outside the guarded shell", () => {
    const files = readdirSync(import.meta.dirname);
    expect(files).toContain("sign-in.tsx");
    expect(files).toContain("_app.tsx");
  });
});
