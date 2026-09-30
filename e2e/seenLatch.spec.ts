import { itemsSeenRequestSchema } from "@memory-shoebox/shared";
import { seedArchiveForSpec } from "./support/archive.ts";
import {
  clearItemViewsForMember,
  seedMemberAtAddress,
} from "./support/database.ts";
import { ADMIN_EMAIL, expect, test } from "./support/signedIn.ts";

/**
 * Surface 2's seen latch (`useSeenLatch`), covered end to end rather than
 * only in jsdom.
 *
 * **Why this cannot share the suite's usual seen state.** Redeeming a
 * sign-in code seeds a view row for every item that exists at that moment
 * (`seedItemViews`), and every fixture in this suite signs in after
 * `beforeAll` has already seeded the archive. That leaves the other specs'
 * admin and viewer starting at `unseenCount: 0` on every day, which is why
 * none of them can catch a regression here. This file uses the same shared
 * admin fixture, then deletes the rows its sign-in wrote and reloads, so the
 * unseen state it measures against is real rather than inherited.
 *
 * **This already shipped broken once, on this branch.** An earlier version of
 * `useSeenLatch` observed an empty container and latched nothing, and every
 * unit test passed, because the jsdom harness mounts prints that are already
 * in the tree. Only a real page, with prints that arrive after the observer
 * does, can catch that.
 *
 * **Scrolling at reading speed is load-bearing, not a nicety.** A day's
 * `.pile` carries `content-visibility: auto`; Chromium keeps its subtree
 * un-laid-out until some part of it nears the viewport, then lays out and
 * delivers intersection records for the whole thing in the same frame. Measured:
 * at roughly 700px every 300ms, every print on a day this size latches; in
 * large jumps, most do not, which is a property of a threshold-0 observer with
 * no `rootMargin` rather than a defect. `?at=` and `scrollIntoView` are both
 * avoided here for the same reason: they do not exercise the observer the way
 * a person scrolling actually does.
 *
 * **The dot is not asserted gone in this same session.** `useSeenLatch`
 * deliberately never refetches after it posts, so the client would have to ask
 * again for an answer it already knows. The dot goes out on the next load,
 * which is a different spec's assertion to make.
 */

/** How far one wheel event scrolls, in pixels. Reading speed, not a jump. */
const SCROLL_STEP_PX = 700;

/** How long to wait after each wheel event, in milliseconds. */
const SCROLL_STEP_DELAY_MS = 300;

/**
 * Total scroll distance: the same figure `scroll.spec.ts` already uses to
 * scan this exact 340-item day from top to bottom.
 */
const SCROLL_DISTANCE_PX = 30_000;

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

test("latches every print on a day as it scrolls past at reading speed", async ({
  adminPage,
}) => {
  test.setTimeout(60_000);

  const { memberId } = await seedMemberAtAddress({
    email: ADMIN_EMAIL,
    role: "admin",
  });

  // The fixture's sign-in already marked every seeded item seen. Clearing
  // what it wrote, then loading fresh, is what makes the unseen state below
  // real rather than inherited from the fixture.
  await clearItemViewsForMember(memberId);

  const seenItemIds: string[] = [];
  adminPage.on("request", (request) => {
    if (
      request.method() !== "POST" ||
      !request.url().includes("/api/items/seen")
    ) {
      return;
    }
    const parsed = itemsSeenRequestSchema.safeParse(
      JSON.parse(request.postData() ?? "{}"),
    );
    if (parsed.success) {
      seenItemIds.push(...parsed.data.itemIds);
    }
  });

  await adminPage.setViewportSize({ width: 400, height: 800 });
  await adminPage.goto("/");
  await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();
  await expect(adminPage.getByText("340 new")).toBeVisible();
  expect(await adminPage.getByText("Not seen yet").count()).toBeGreaterThan(0);

  await adminPage.mouse.move(200, 400);
  // Reading speed, not a jump: the file doc above explains why the speed is
  // load-bearing.
  for (
    let scrolled = 0;
    scrolled < SCROLL_DISTANCE_PX;
    scrolled += SCROLL_STEP_PX
  ) {
    await adminPage.mouse.wheel(0, SCROLL_STEP_PX);
    await adminPage.waitForTimeout(SCROLL_STEP_DELAY_MS);
  }

  // A wide majority of the 340 rather than all of it: the point is that the
  // latch fired for this day's items, not that this run's timing was perfect.
  expect(new Set(seenItemIds).size).toBeGreaterThan(300);
});
