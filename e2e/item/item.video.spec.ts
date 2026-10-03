import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surface 4 end to end: a comment pinned to a moment, and its mark on the
 * scrubber.
 *
 * The one seeded video is on 4 July, ten seconds long. Nothing loads in this
 * run, which is the case the transport is built for: its duration and every
 * mark come from the contract's `durationMs`, not from the element.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

test("pins a comment to a moment and puts its mark on the scrubber", async ({
  adminPage,
}) => {
  await adminPage.goto("/?at=2026-07-04");
  await adminPage.locator("[data-item-id]").filter({ hasText: "0:10" }).click();

  const slider = adminPage.getByRole("slider", { name: "Where in the video" });
  await expect(slider).toHaveAttribute("aria-valuetext", "0:00 of 0:10");
  await slider.focus();
  for (let step = 0; step < 4; step += 1) {
    await adminPage.keyboard.press("ArrowRight");
  }
  await expect(slider).toHaveAttribute("aria-valuetext", "0:04 of 0:10");

  await adminPage
    .getByRole("button", { name: "Pin a comment to this moment" })
    .click();
  await adminPage
    .getByRole("textbox", { name: "Say something at 0:04" })
    .fill("There. That little sigh.");
  await adminPage.getByRole("button", { name: "Send" }).click();

  await expect(
    adminPage.getByRole("button", { name: /comment at 0:04$/u }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("heading", { name: "1 comment, 1 pinned to a moment" }),
  ).toBeVisible();
});
