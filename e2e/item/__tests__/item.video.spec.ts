import { seedArchiveForSpec } from "../../support/archiveSeedHelpers.ts";
import { openSeededVideo } from "../../support/itemHelpers.ts";
import { expect, test } from "../../support/signedIn/signedIn.ts";

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
  await openSeededVideo(adminPage);

  const slider = adminPage.getByRole("slider", { name: "Where in the video" });
  await expect(slider).toHaveAttribute("aria-valuetext", "0:00 of 0:10");
  await slider.focus();
  for (let step = 0; step < 4; step += 1) {
    await adminPage.keyboard.press("ArrowRight");
  }
  await expect(slider).toHaveAttribute("aria-valuetext", "0:04 of 0:10");

  await adminPage
    .getByRole("button", { name: "Comment on this moment" })
    .click();
  await adminPage
    .getByRole("textbox", { name: "Write a comment" })
    .fill("There. That little sigh.");
  await expect(
    adminPage.getByRole("button", {
      name: "Comment at 0:04; switch to whole video",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await adminPage.getByRole("button", { name: "Post comment" }).click();

  await expect(
    adminPage.getByRole("button", { name: /^Seek to 0:04:/u }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("heading", { name: "Comments 1" }),
  ).toBeVisible();
  await expect(
    adminPage
      .getByRole("article")
      .filter({ hasText: "There. That little sigh." })
      .getByRole("button", { name: "0:04 Go to this moment", exact: true }),
  ).toBeVisible();
});
