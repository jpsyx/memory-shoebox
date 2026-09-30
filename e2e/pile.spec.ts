import { seedArchiveIntoE2eCatalog } from "./support/archive.ts";
import { seedMemberAtAddress } from "./support/database.ts";
import { ADMIN_EMAIL, expect, test, VIEWER_EMAIL } from "./support/signedIn.ts";

/**
 * Surface 2 against the seeded archive.
 *
 * **Several tests open a day directly with `?at=`** rather than scrolling to
 * it. That is not only for speed: `.pile` carries `content-visibility: auto`,
 * so a day nowhere near the viewport is not laid out at all and every element
 * inside it has an empty box. `toBeVisible` is a statement about a box, so a
 * day has to be on screen for one to mean anything, and `?at=` is how this
 * product puts a day on screen.
 */

test.beforeAll(async () => {
  const uploader = await seedMemberAtAddress({
    email: ADMIN_EMAIL,
    role: "admin",
  });
  const viewer = await seedMemberAtAddress({
    email: VIEWER_EMAIL,
    role: "viewer",
  });
  await seedArchiveIntoE2eCatalog({
    uploaderMemberId: uploader.memberId,
    viewerMemberId: viewer.memberId,
  });
});

test.describe("the pile", () => {
  test("descends by day, each with its own count", async ({ adminPage }) => {
    await adminPage.goto("/");
    await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();
    // "340 photos" rather than "340": the spine says it twice on this day,
    // once as the count and once as "340 new", because an admin has seen none
    // of them.
    await expect(adminPage.getByText("340 photos")).toBeVisible();
  });

  test("collapses a run of frames into one stack", async ({ adminPage }) => {
    await adminPage.goto("/?at=2026-09-26");
    await expect(adminPage.locator("[data-burst-id]").first()).toBeVisible();
    await expect(adminPage.getByText("frames").first()).toBeVisible();
  });

  test("draws a burst with one visible frame as a plain print", async ({
    viewerPage,
  }) => {
    await viewerPage.goto("/?at=2026-08-02");
    const day = viewerPage.locator("#day-2026-08-02");
    await expect(day).toBeAttached();
    // Three of four frames are restricted, so the server sends `burst: null`
    // and there is no stack to find on that day.
    await expect(viewerPage.getByText("frames")).toHaveCount(0);
  });

  test("draws nothing at all for a burst with no visible frames", async ({
    viewerPage,
  }) => {
    await viewerPage.goto("/?at=2026-08-02");
    await expect(viewerPage.locator("#day-2026-08-02")).toBeAttached();
    await expect(viewerPage.getByText("hidden-1")).toHaveCount(0);
  });

  test("opens an occasion with its band and continues it with strips", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?at=2026-09-25");
    // Twice each: the band and the spine both name the occasion, and the
    // spine repeats the continuation strip's own words.
    await expect(adminPage.getByText("Coming home").first()).toBeVisible();
    await expect(adminPage.getByText(/day 5 of 5/).first()).toBeVisible();
  });

  test("stands a milestone-only day up with nothing attached", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?at=2026-09-15");
    await expect(
      adminPage.getByText(/Nothing is attached to this one yet/),
    ).toBeVisible();
  });

  test("marks the end of the archive rather than just stopping", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?at=2026-07-04");
    await expect(adminPage.getByText("That is all of it.")).toBeVisible();
  });

  test("jumps without putting a filter chip on the strip", async ({
    adminPage,
  }) => {
    await adminPage.goto("/?at=2026-09-10");
    await expect(adminPage.locator("#day-2026-09-10")).toBeAttached();
    await expect(
      adminPage.getByRole("button", { name: "Clear, show everything" }),
    ).toHaveCount(0);
  });

  test("reaches a print, and the filter, with a keyboard alone", async ({
    adminPage,
  }) => {
    await adminPage.goto("/");
    await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();
    // `body.press` for the first key only, for the reason `signIn.spec.ts`
    // gives: a page Playwright has just opened has no focus of its own.
    await adminPage.locator("body").press("Tab");
    for (let press = 0; press < 30; press += 1) {
      const reached = await adminPage.evaluate(() => {
        return document.activeElement?.getAttribute("data-item-id") ?? "";
      });
      if (reached !== "") {
        break;
      }
      await adminPage.keyboard.press("Tab");
    }
    expect(
      await adminPage.evaluate(() => {
        return document.activeElement?.getAttribute("data-item-id");
      }),
    ).toBeTruthy();
  });

  test.fixme("fans a burst open in place", async ({ adminPage }) => {
    // `GET /api/bursts/:burstId/frames` is step 5a's. Turn this on when it
    // merges: the client is already written against the frozen contract.
    await adminPage.goto("/?at=2026-09-26");
    await adminPage.locator("[data-burst-id] button").first().click();
    await expect(
      adminPage.getByRole("button", { name: "Collapse" }),
    ).toBeVisible();
  });

  test("shows no horizontal scrollbar at 200% zoom", async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 640, height: 720 });
    await adminPage.goto("/");
    await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();
    const overflows = await adminPage.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(overflows).toBe(false);
  });
});
