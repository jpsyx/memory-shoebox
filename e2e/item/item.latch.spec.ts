import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import {
  clearItemViewsForMember,
  readItemViewsForMember,
  seedMemberAtAddress,
} from "../support/database.ts";
import { ADMIN_EMAIL, expect, test } from "../support/signedIn.ts";

/**
 * What opening an item writes, read back from the catalog itself
 * (`step-6b.md` § Verification).
 *
 * Opening latches the item opened and its siblings seen only, which is what
 * keeps surface 17's "scrolled past, never opened" row honest. The pile's own
 * latch would muddy this, so the item is reached through the pile once, its
 * views are cleared, and the permalink is reloaded on its own.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** The first frame of the 26 September burst, by way of the pile. */
async function _reachTheFirstFrame(page: Page): Promise<string> {
  await page.goto("/?at=2026-09-26");
  const stack = page.locator("[data-burst-id]").first();
  await stack.getByRole("button").first().click();
  // Until the frames arrive the cover is the stack's one print, and it
  // matches the frame below, so the fan has to be open first.
  await expect(page.getByRole("button", { name: "Collapse" })).toBeVisible();
  await stack
    .getByRole("button", { name: /26 September 2026/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
  // The address changes before the item's own request has been answered, and
  // that answer is an open. Drawn means answered, so the clear below cannot
  // land before it and leave this open counted on top of the reload's.
  await expect(page.getByText("Frame 1 of 45", { exact: true })).toBeVisible();
  return page.url().split("/").pop() ?? "";
}

test("opens the item and only sees its forty-four siblings", async ({
  adminPage,
}) => {
  const { memberId } = await seedMemberAtAddress({
    email: ADMIN_EMAIL,
    role: "admin",
  });
  const itemId = await _reachTheFirstFrame(adminPage);

  await clearItemViewsForMember(memberId);
  await adminPage.reload();
  await expect(
    adminPage.getByText("Frame 1 of 45", { exact: true }),
  ).toBeVisible();

  const views = await readItemViewsForMember(memberId);
  const opened = views.filter((view) => {
    return view.firstOpenedAt !== null;
  });
  const seenOnly = views.filter((view) => {
    return view.firstOpenedAt === null;
  });
  expect(
    opened.map((view) => {
      return view.itemId;
    }),
  ).toEqual([itemId]);
  expect(opened[0]?.openCount).toBe(1);
  expect(seenOnly).toHaveLength(44);
});
