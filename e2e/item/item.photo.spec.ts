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
    adminPage.getByText("Frame 1 of 45", { exact: true }),
  ).toBeVisible();
  const strip = adminPage.getByRole("navigation", { name: /^45 frames/ });
  await expect(strip.getByRole("link")).toHaveCount(45);
  await expect(
    strip.getByRole("link", { name: "Frame 1 of 45" }),
  ).toHaveAttribute("aria-current", "page");
});

test("moves along the burst, and Back leaves it rather than stepping through it", async ({
  adminPage,
}) => {
  await openFirstFrameOfBurst(adminPage);

  const strip = adminPage.getByRole("navigation", { name: /^45 frames/ });
  await strip.getByRole("link", { name: "Frame 2 of 45" }).click();
  await expect(
    adminPage.getByText("Frame 2 of 45", { exact: true }),
  ).toBeVisible();

  await adminPage.getByRole("link", { name: "Back to 26 September" }).click();
  await expect(adminPage).toHaveURL(/\/\?at=2026-09-26$/u);
});

test("reacts and comments, and both are still there after a reload", async ({
  adminPage,
}) => {
  await openFirstFrameOfBurst(adminPage);

  await adminPage.getByRole("button", { name: "React", exact: true }).click();
  const picker = adminPage.getByRole("dialog");
  await picker.getByRole("button", { name: "Love" }).click();
  // The picker closes on a choice, and its own "Love" stays in the page for
  // the length of its exit transition, so the row is read once it has gone.
  await expect(picker).toHaveCount(0);
  await expect(
    adminPage.getByRole("button", { name: "Love", exact: true }),
  ).toBeVisible();

  await adminPage
    .getByRole("textbox", { name: "Say something" })
    .fill("He has his mother's chin.");
  await adminPage.getByRole("button", { name: "Send" }).click();
  await expect(adminPage.getByText("He has his mother's chin.")).toBeVisible();
  await expect(
    adminPage.getByRole("heading", { name: "1 comment" }),
  ).toBeVisible();

  await adminPage.reload();
  await expect(adminPage.getByText("He has his mother's chin.")).toBeVisible();
  await expect(
    adminPage.getByRole("button", { name: "Love", exact: true }),
  ).toBeVisible();
});
