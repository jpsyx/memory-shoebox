import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SURFACE_ROUTES = [
  "index.tsx",
  "items.$itemId.tsx",
  "items.$itemId_.removal.tsx",
  "people.tsx",
  "upload.tsx",
  "account.tsx",
  "settings.tsx",
  "members.tsx",
  "groups.tsx",
  "milestones.tsx",
  "removal-requests.tsx",
  "presence.tsx",
  "changes.tsx",
];

/*
 * This file counts the routes; `rendering.test.tsx` opens them. Both are
 * needed and only the second would have caught `$itemId_`: the removal route
 * was here, correctly named, and rendered the item page when navigated to.
 */
describe("the route tree", () => {
  it("has one signed-in route per surface and no more", () => {
    const files = readdirSync(join(import.meta.dirname, "_app"));
    expect([...files].sort()).toEqual([...SURFACE_ROUTES].sort());
  });

  it("keeps sign-in outside the guarded shell", () => {
    const files = readdirSync(import.meta.dirname);
    expect(files).toContain("sign-in.tsx");
    expect(files).toContain("_app.tsx");
  });
});
