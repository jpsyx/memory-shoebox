import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./uploadSurfaceTestHelpers.ts";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixtures/makeUploadSurfaceFixtures.ts";

test("surface 8 keyboard can choose files, tag people, inspect milestones, restore focus and commit", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  const paths = makeUploadSurfaceFixturePaths({
    directory: testInfo.outputPath("keyboard"),
    count: 1,
  });
  await _pickKeyboardFile({ page, paths });
  await _pressButton(page, "Tick all 1");
  await _keyboardLabel(page, "Add a tag", "Tags", "keyboard tag");
  await _pressButton(page, "Tick all 1");
  await _keyboardLabel(
    page,
    "Tag somebody",
    "Who is in them",
    "Keyboard Cousin",
  );
  await _pressButton(page, "Tick all 1");
  await _pressButton(page, "Put under a milestone");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Put under a milestone", exact: true }),
  ).toBeFocused();
  await _tabTo(
    page,
    page.getByRole("radio", { name: "Everyone", exact: true }),
  );
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("radio", { name: "Everyone", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
  await _pressButton(page, "Put 1 up");
  await expect(page.getByRole("heading", { name: /1 up, across/ })).toBeVisible(
    { timeout: 90_000 },
  );
});

async function _keyboardLabel(
  page: Page,
  button: string,
  label: string,
  value: string,
): Promise<void> {
  await _pressButton(page, button);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  const field = page.getByRole("combobox", { name: label, exact: true });
  await _tabTo(page, field);
  await expect(field).toBeFocused();
  await page.keyboard.type(value);
  await expect(field).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue("");
  if ((await field.getAttribute("aria-expanded")) === "true") {
    await page.keyboard.press("Escape");
  }
  await _tabTo(
    page,
    dialog.getByRole("button", { name: "Close", exact: true }),
  );
  await page.keyboard.press(_keyboardTab(page, true));
  await expect
    .poll(async () => {
      return dialog.evaluate((element) => {
        return element.contains(document.activeElement);
      });
    })
    .toBe(true);
  await _pressButton(page, "Tag all 1");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Put it all up.", exact: true }),
  ).toBeFocused();
}

async function _pressButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });
  await _tabTo(page, button);
  await expect(button).toBeFocused();
  expect(
    await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        style.outlineStyle !== "none" &&
        Number.parseFloat(style.outlineWidth) >= 2
      );
    }),
  ).toBe(true);
  await page.keyboard.press("Enter");
}

async function _tabTo(
  page: Page,
  locator: Locator,
  remaining = 100,
): Promise<void> {
  if (
    await locator.evaluate((element) => {
      return element === document.activeElement;
    })
  ) {
    return;
  }
  if (remaining === 0) {
    throw new Error(
      `Keyboard could not reach ${(await locator.getAttribute("aria-label")) ?? (await locator.textContent())}`,
    );
  }
  await page.keyboard.press(_keyboardTab(page));
  await _tabTo(page, locator, remaining - 1);
}

function _keyboardTab(page: Page, isBackward = false): string {
  const isMacWebKit =
    process.platform === "darwin" &&
    page.context().browser()?.browserType().name() === "webkit";
  return `${isMacWebKit ? "Alt+" : ""}${isBackward ? "Shift+" : ""}Tab`;
}

async function _pickKeyboardFile(
  options: Readonly<{ page: Page; paths: readonly string[] }>,
): Promise<void> {
  const { page, paths } = options;
  await _tabTo(
    page,
    page.getByRole("button", { name: /Drop photos and videos here/ }),
  );
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(paths);
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
}
