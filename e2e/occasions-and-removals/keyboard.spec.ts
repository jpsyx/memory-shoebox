import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import {
  activateControlWithKeyboard,
  getMilestoneCandidatesFromPage,
  reachControlWithKeyboard,
  seedOccasionThroughApi,
} from "./support/occasionBrowserHelpers.ts";
import { seedOpenRemovalRequest } from "./support/removalBrowserHelpers.ts";
import { seedAskingAndOccasions } from "./support/seedAskingAndOccasions/seedAskingAndOccasions.ts";
test("live keyboard request opens the reply dialog and Cancel restores its owning trigger", async ({
  askerPage,
  uploaderPage: page,
}) => {
  const { itemId } = await seedAskingAndOccasions({
    label: "Keyboard removal",
  });
  await askerPage.goto(`/items/${itemId}/removal`);
  const reasonField = askerPage.getByLabel("Why, if you want to say");
  await expect(reasonField).toBeVisible();
  await reachControlWithKeyboard({ page: askerPage, control: reasonField });
  await askerPage.keyboard.type("Keyboard request, Inés.");
  await reachControlWithKeyboard({
    page: askerPage,
    control: askerPage.getByRole("button", { name: "Send the request" }),
  });
  await askerPage.keyboard.press("Enter");
  await expect(
    askerPage.getByText("You have already asked about this one."),
  ).toBeVisible();
  await page.goto("/removal-requests");
  const card = page
    .getByRole("region", { name: "Request from Inés Álvarez" })
    .filter({ hasText: "Keyboard request, Inés." });
  const trigger = card.getByRole("button", { name: "Keep it, and say why" });
  await expect(trigger).toBeVisible();
  await activateControlWithKeyboard({ page: page, control: trigger });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await activateControlWithKeyboard({
    page: page,
    control: dialog.getByRole("button", { name: "Cancel", exact: true }),
  });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("live keyboard decline traps focus and restores Waiting after settlement", async ({
  askerPage,
  uploaderPage: page,
}) => {
  await seedOpenRemovalRequest({
    page: askerPage,
    label: "Keyboard decline",
    reason: "Keyboard decline, Inés.",
  });
  await page.goto("/removal-requests");
  const card = page
    .getByRole("region", { name: "Request from Inés Álvarez" })
    .filter({ hasText: "Keyboard decline, Inés." });
  const trigger = card.getByRole("button", { name: "Keep it, and say why" });
  await reachControlWithKeyboard({ page: page, control: trigger });
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("Enter");
  await reachControlWithKeyboard({
    page: page,
    control: dialog.getByRole("textbox"),
  });
  await page.keyboard.type("Keeping it for the family, Émile.");
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press(step < 5 ? "Tab" : "Shift+Tab");
    await expect
      .poll(() => {
        return dialog.evaluate((element) => {
          return element.contains(document.activeElement);
        });
      })
      .toBe(true);
  }
  await reachControlWithKeyboard({
    page: page,
    control: dialog.getByRole("button", { name: "Send this and keep it" }),
  });
  await page.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/keyboard-decline-focus.png`,
    fullPage: true,
  });
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Waiting/ })).toBeFocused();
});

test("live keyboard attachment toggles pressed prints and saves the explicit delta", async ({
  uploaderPage: page,
}) => {
  const LABEL = "Keyboard attachment";
  const { itemId } = await seedAskingAndOccasions({
    label: LABEL,
    capturedOn: "2026-10-17",
  });
  const created = await seedOccasionThroughApi({
    page: page,
    name: LABEL,
  });
  expect(created.status()).toBe(201);
  const detail = await created.json();
  await page.goto(
    `/milestones?milestone=${detail.milestone.milestoneId}&mode=created`,
  );
  const print = page.getByRole("button", { name: LABEL, exact: true });
  await expect(print).toBeVisible();
  await activateControlWithKeyboard({ page: page, control: print });
  await expect(print).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(print).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  await reachControlWithKeyboard({
    page: page,
    control: page.getByRole("button", { name: "Save photographs" }),
    backwards: true,
  });
  await page.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/keyboard-attach-focus.png`,
    fullPage: true,
  });
  await page.keyboard.press("Enter");
  await expect(page.getByText("1 attached; 0 detached.")).toBeVisible();
  const candidates = await getMilestoneCandidatesFromPage({
    page,
    milestoneId: detail.milestone.milestoneId,
  });
  expect(
    candidates.candidates.find((candidate) => {
      return candidate.item.itemId === itemId;
    })?.isAttached,
  ).toBe(true);
});
