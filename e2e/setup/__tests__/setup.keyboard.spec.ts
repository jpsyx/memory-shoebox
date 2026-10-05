import type { Page, Locator } from "@playwright/test";
import { test, expect } from "./setup.fixtures.ts";
import { expectUploadHome } from "./setupActionHelpers.ts";

async function _tabTo(
  options: Readonly<{ page: Page; target: Locator }>,
): Promise<void> {
  const { page, target } = options;
  for (let numTabs = 0; numTabs < 30; numTabs += 1) {
    if (
      await target.evaluate((element) => {
        return element === document.activeElement;
      })
    ) {
      return;
    }
    await page.keyboard.press(
      page.context().browser()?.browserType().name() === "webkit"
        ? "Alt+Tab"
        : "Tab",
    );
  }
  await expect(target).toBeFocused();
}
async function _keyboardConfirmCreation(page: Page): Promise<void> {
  await _tabTo({
    page: page,
    target: page.getByRole("button", {
      name: "Review your email",
      exact: true,
    }),
  });
  await page.keyboard.press("Enter");
  await _tabTo({
    page: page,
    target: page.getByRole("button", {
      name: "Create your Shoebox",
      exact: true,
    }),
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/setup\/invite$/);
}
async function _keyboardCreate(page: Page): Promise<void> {
  await page.goto("/setup");
  await _tabTo({
    page: page,
    target: page.getByLabel("Your name", { exact: true }),
  });
  await page.keyboard.type("Rosa");
  await page.keyboard.press(
    page.context().browser()?.browserType().name() === "webkit"
      ? "Alt+Tab"
      : "Tab",
  );
  await page.keyboard.type("rosa@example.com");
  await _keyboardConfirmCreation(page);
}

test("keyboard-only creation and skip reach home", async ({ page }) => {
  await _keyboardCreate(page);
  await _tabTo({
    page: page,
    target: page.getByRole("button", { name: "Skip for now" }),
  });
  await page.keyboard.press("Enter");
  await expectUploadHome(page);
});

test("focuses the missing name and queues one invitation using only the keyboard", async ({
  page,
  catalog,
}) => {
  await page.goto("/setup");
  await _tabTo({
    page: page,
    target: page.getByRole("button", {
      name: "Review your email",
      exact: true,
    }),
  });
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Your name", { exact: true })).toBeFocused();
  await page.keyboard.type("Rosa");
  await page.keyboard.press(
    page.context().browser()?.browserType().name() === "webkit"
      ? "Alt+Tab"
      : "Tab",
  );
  await page.keyboard.type("rosa@example.com");
  await _keyboardConfirmCreation(page);
  await _tabTo({
    page: page,
    target: page.getByLabel("Email 1", { exact: true }),
  });
  await page.keyboard.type("keyboard@example.com");
  await _tabTo({
    page: page,
    target: page.getByRole("button", { name: "Send invitations" }),
  });
  await page.keyboard.press("Enter");
  await expectUploadHome(page);
  expect(catalog.assertions.invitations()).toHaveLength(1);
});
