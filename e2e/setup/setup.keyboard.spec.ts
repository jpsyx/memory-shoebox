import type { Page, Locator } from "@playwright/test";
import { test, expect } from "./setup.fixtures.ts";
import { expectUploadHome } from "./setup.actions.ts";

async function _tabTo(page: Page, target: Locator): Promise<void> {
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
async function _keyboardCreate(page: Page): Promise<void> {
  await page.goto("/setup");
  await _tabTo(page, page.getByLabel("Your name", { exact: true }));
  await page.keyboard.type("Rosa");
  await page.keyboard.press(
    page.context().browser()?.browserType().name() === "webkit"
      ? "Alt+Tab"
      : "Tab",
  );
  await page.keyboard.type("rosa@example.com");
  await _tabTo(
    page,
    page.getByRole("button", { name: "Review your email", exact: true }),
  );
  await page.keyboard.press("Enter");
  await _tabTo(
    page,
    page.getByRole("button", { name: "Create your Shoebox", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/setup\/invite$/);
}

test("keyboard-only creation and skip reach home", async ({ page }) => {
  await _keyboardCreate(page);
  await _tabTo(page, page.getByRole("button", { name: "Skip for now" }));
  await page.keyboard.press("Enter");
  await expectUploadHome(page);
});

test("keyboard-only invitation and validation focus use labelled fields", async ({
  page,
  catalog,
}) => {
  await page.goto("/setup");
  await _tabTo(
    page,
    page.getByRole("button", { name: "Review your email", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Your name", { exact: true })).toBeFocused();
  await page.keyboard.type("Rosa");
  await page.keyboard.press(
    page.context().browser()?.browserType().name() === "webkit"
      ? "Alt+Tab"
      : "Tab",
  );
  await page.keyboard.type("rosa@example.com");
  await _tabTo(
    page,
    page.getByRole("button", { name: "Review your email", exact: true }),
  );
  await page.keyboard.press("Enter");
  await _tabTo(
    page,
    page.getByRole("button", { name: "Create your Shoebox", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/setup\/invite$/);
  await _tabTo(page, page.getByLabel("Email 1", { exact: true }));
  await page.keyboard.type("keyboard@example.com");
  await _tabTo(page, page.getByRole("button", { name: "Send invitations" }));
  await page.keyboard.press("Enter");
  await expectUploadHome(page);
  expect(catalog.assertions.invitations()).toHaveLength(1);
});
