import { test, expect } from "./asking-occasions.fixtures.ts";
import { seedAskingAndOccasions } from "./support/seedAskingAndOccasions/seedAskingAndOccasions.ts";
import { reachControlWithKeyboard } from "./support/occasionBrowserHelpers.ts";
import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";

test("live keyboard asks and declines with dialog trap, Cancel restoration and surviving settlement focus", async ({
  askerPage,
  uploaderPage,
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
  await uploaderPage.goto("/removal-requests");
  const card = uploaderPage
    .getByRole("region", { name: "Request from Inés Álvarez" })
    .filter({ hasText: "Keyboard request, Inés." });
  const trigger = card.getByRole("button", { name: "Keep it, and say why" });
  await expect(trigger).toBeVisible();
  await reachControlWithKeyboard({ page: uploaderPage, control: trigger });
  await uploaderPage.keyboard.press("Enter");
  const dialog = uploaderPage.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await reachControlWithKeyboard({
    page: uploaderPage,
    control: dialog.getByRole("button", { name: "Cancel", exact: true }),
  });
  await uploaderPage.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await uploaderPage.keyboard.press("Enter");
  await reachControlWithKeyboard({
    page: uploaderPage,
    control: dialog.getByRole("textbox"),
  });
  await uploaderPage.keyboard.type("Keeping it for the family, Émile.");
  for (let step = 0; step < 10; step += 1) {
    await uploaderPage.keyboard.press(step < 5 ? "Tab" : "Shift+Tab");
    await expect
      .poll(() => {
        return dialog.evaluate((element) => {
          return element.contains(document.activeElement);
        });
      })
      .toBe(true);
  }
  await reachControlWithKeyboard({
    page: uploaderPage,
    control: dialog.getByRole("button", { name: "Send this and keep it" }),
  });
  await uploaderPage.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/keyboard-decline-focus.png`,
    fullPage: true,
  });
  await uploaderPage.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(
    uploaderPage.getByRole("tab", { name: /Waiting/ }),
  ).toBeFocused();
});

test("live keyboard attachment toggles pressed prints and saves the explicit delta", async ({
  uploaderPage,
}) => {
  const label = "Keyboard attachment";
  const { itemId } = await seedAskingAndOccasions({
    label,
    capturedOn: "2026-10-17",
  });
  const created = await uploaderPage.request.post("/api/milestones", {
    data: {
      name: label,
      startsOn: "2026-10-17",
      endsOn: "2026-10-17",
      blurb: null,
    },
  });
  expect(created.status()).toBe(201);
  const detail = await created.json();
  await uploaderPage.goto(
    `/milestones?milestone=${detail.milestone.milestoneId}&mode=created`,
  );
  const print = uploaderPage.getByRole("button", { name: label, exact: true });
  await expect(print).toBeVisible();
  await reachControlWithKeyboard({ page: uploaderPage, control: print });
  await uploaderPage.keyboard.press("Enter");
  await expect(print).toHaveAttribute("aria-pressed", "true");
  await uploaderPage.keyboard.press("Enter");
  await expect(print).toHaveAttribute("aria-pressed", "false");
  await uploaderPage.keyboard.press("Enter");
  await reachControlWithKeyboard({
    page: uploaderPage,
    control: uploaderPage.getByRole("button", { name: "Save photographs" }),
    backwards: true,
  });
  await uploaderPage.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/keyboard-attach-focus.png`,
    fullPage: true,
  });
  await uploaderPage.keyboard.press("Enter");
  await expect(uploaderPage.getByText("1 attached; 0 detached.")).toBeVisible();
  const candidates = await uploaderPage.request.get(
    `/api/milestones/${detail.milestone.milestoneId}/candidates`,
  );
  expect(
    (await candidates.json()).candidates.find(
      (candidate: { item: { itemId: string } }) => {
        return candidate.item.itemId === itemId;
      },
    ).isAttached,
  ).toBe(true);
});
