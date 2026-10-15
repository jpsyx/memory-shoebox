import { seedArchiveForSpec } from "../support/archive.ts";
import { openFirstFrameOfBurst } from "../support/itemHelpers.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surface 3 end to end: opened from a fanned burst in the pile, moved along,
 * reacted to and commented on, and left by the way it came in.
 *
 * The burst is the forty-five-frame candle on 26 September
 * (`apps/server/scripts/archiveSeed/archivePlan.ts`). No media loads in this
 * run (`support/archive.ts`), so nothing here waits on an image.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

test("opens a fanned frame from the pile, with its burst beside it", async ({
  adminPage,
}) => {
  await openFirstFrameOfBurst(adminPage);

  await expect(
    adminPage.getByRole("heading", {
      level: 1,
      name: "A photograph from 26 September 2026",
    }),
  ).toBeAttached();
  await expect(
    adminPage.getByText("Photo 1 of 45", { exact: true }),
  ).toBeVisible();
  const strip = adminPage.getByRole("navigation", { name: /^45 photos/ });
  await expect(strip.getByRole("link")).toHaveCount(45);
  await expect(
    strip.getByRole("link", { name: "Photo 1 of 45" }),
  ).toHaveAttribute("aria-current", "page");
});

test("moves along the burst, and Back leaves it rather than stepping through it", async ({
  adminPage,
}) => {
  await openFirstFrameOfBurst(adminPage);

  const strip = adminPage.getByRole("navigation", { name: /^45 photos/ });
  await strip.getByRole("link", { name: "Photo 2 of 45" }).click();
  await expect(
    adminPage.getByText("Photo 2 of 45", { exact: true }),
  ).toBeVisible();

  await adminPage.getByRole("link", { name: "Back to 26 September" }).click();
  await expect(adminPage).toHaveURL(/\/\?at=2026-09-26$/u);
});

test("reacts and comments, and both are still there after a reload", async ({
  adminPage,
}) => {
  await openFirstFrameOfBurst(adminPage);

  const love = adminPage.getByRole("button", {
    name: "React: Love",
    exact: true,
  });
  await love.click();
  await expect(love).toHaveAttribute("aria-pressed", "true");

  await adminPage
    .getByRole("textbox", { name: "Write a comment" })
    .fill("He has his mother's chin.");
  await adminPage.getByRole("button", { name: "Post comment" }).click();
  await expect(adminPage.getByText("He has his mother's chin.")).toBeVisible();
  await expect(
    adminPage.getByRole("heading", { name: "Comments 1" }),
  ).toBeVisible();

  await adminPage.reload();
  await expect(adminPage.getByText("He has his mother's chin.")).toBeVisible();
  await expect(love).toHaveAttribute("aria-pressed", "true");
});

for (const movesWhilePending of [false, true]) {
  test(`keeps the ${movesWhilePending ? "current reading print after scrolling" : "activated cover position"} through a held burst opening`, async ({
    adminPage: page,
  }) => {
    await page.goto("/?at=2026-09-26");
    const stack = page
      .locator("[data-burst-id]")
      .filter({ has: page.getByRole("button", { name: /\b45 photos$/ }) });
    await expect(stack).toHaveCount(1);
    const burstId = await stack.getAttribute("data-burst-id");
    const cover = stack.getByRole("button").first();
    let release!: () => void;
    let arrived!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    const requested = new Promise<void>((done) => {
      arrived = done;
    });
    let firstId = "";
    await page.route(`**/api/bursts/${burstId}/frames`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      expect(body.frames).toHaveLength(45);
      firstId = body.frames.find((frame: { position: number }) => {
        return frame.position === 1;
      }).itemId;
      arrived();
      await held;
      await route.fulfill({ response });
    });
    await cover.click();
    await requested;
    await expect(cover).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Collapse", exact: true }),
    ).toHaveCount(0);
    await page.mouse.move(0, 0);
    await cover.evaluate(async (node) => {
      await Promise.all(
        node.getAnimations().map((animation) => {
          return animation.finished.catch(() => {});
        }),
      );
    });
    let readingId = "";
    let readingTop = (await cover.boundingBox())!.y;
    if (movesWhilePending) {
      const beforeScroll = await page.evaluate(() => {
        return scrollY;
      });
      await page.mouse.wheel(0, 600);
      await expect
        .poll(() => {
          return page.evaluate(() => {
            return scrollY;
          });
        })
        .toBeGreaterThan(beforeScroll + 300);
      const reading = await page
        .locator("button[data-item-id]")
        .evaluateAll((nodes) => {
          const node = nodes.find((candidate) => {
            const box = candidate.getBoundingClientRect();
            return box.top > 100 && box.top < innerHeight - 100;
          });
          if (!node)
            throw new Error(
              "No actual reading print reached after native wheel input",
            );
          return {
            id: node.getAttribute("data-item-id")!,
            top: node.getBoundingClientRect().top,
          };
        });
      readingId = reading.id;
      readingTop = reading.top;
    }
    release();
    await expect(
      page
        .locator(`[data-fan-row="${burstId}"]`)
        .getByRole("button", { name: "Collapse", exact: true }),
    ).toHaveCount(1);
    const target = page.locator(
      `button[data-item-id="${readingId || firstId}"]`,
    );
    await expect(target).toHaveCount(1);
    await expect
      .poll(async () => {
        return Math.abs((await target.boundingBox())!.y - readingTop);
      })
      .toBeLessThanOrEqual(2);
    if (!movesWhilePending) {
      await expect(target).toBeInViewport();
      await expect(target).toHaveAccessibleName(/26 September 2026/);
    }
  });
}
