import { seedArchiveForSpec } from "./support/archive.ts";
import { expect, test } from "./support/signedIn.ts";

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
  await seedArchiveForSpec();
});

test.describe("the pile", () => {
  test("descends by day, each with its own count", async ({ adminPage }) => {
    await adminPage.goto("/");
    await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();
    // "340 photos" rather than "340": the spine appends the unit word to the
    // count. There is no "340 new" beside it, because redeeming a sign-in
    // code seeds a view row for every existing item (`seedItemViews`), and
    // every member in this suite signs in after the archive is already
    // seeded, so nothing in the run ever carries an unseen marker.
    // `seenLatch.spec.ts` is where the unseen state is put back deliberately.
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
    // The bar's own "Find" link is what opens the filter sheet, so it
    // gaining focus is what "reaches ... the filter" actually means here.
    // Removing its focusability would leave this assertion to catch it,
    // where the print check alone never would.
    const findLink = adminPage.getByRole("link", {
      name: "Find",
      exact: true,
    });

    // `body.press` for the first key only, for the reason `signIn.spec.ts`
    // gives: a page Playwright has just opened has no focus of its own.
    await adminPage.locator("body").press("Tab");
    let reachedFind = false;
    let reachedItem = false;
    for (let press = 0; press < 30; press += 1) {
      reachedFind ||= await findLink.evaluate((element) => {
        return element === document.activeElement;
      });
      reachedItem ||=
        (await adminPage.evaluate(() => {
          return document.activeElement?.getAttribute("data-item-id") ?? "";
        })) !== "";
      if (reachedFind && reachedItem) {
        break;
      }
      await adminPage.keyboard.press("Tab");
    }

    expect(reachedFind, "the find control").toBe(true);
    expect(reachedItem, "a print").toBe(true);
  });

  test("fans a burst open in place", async ({ adminPage }) => {
    await adminPage.goto("/?at=2026-09-26");
    await adminPage.locator("[data-burst-id] button").first().click();
    await expect(
      adminPage.getByRole("button", { name: "Collapse" }),
    ).toBeVisible();
    await expect(adminPage).toHaveURL(/\/\?at=2026-09-26$/u);
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
