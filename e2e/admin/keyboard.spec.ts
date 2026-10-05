import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";
async function _enterInvalidInvitationWithKeyboard(
  page: Page,
): Promise<Locator> {
  const email = page.getByLabel("Their email", { exact: true });
  await _tabTo({
    page,
    target: email,
  });
  await page.keyboard.type("not-an-email");
  await _tabTo({
    page,
    target: page.getByRole("button", {
      name: "Send the invitation",
      exact: true,
    }),
  });
  await page.keyboard.press("Enter");
  return email;
}

async function _draftViewerRoleWithKeyboard(page: Page): Promise<Locator> {
  await page.goto("/api/evidence/session/admin?to=/members");
  const trigger = page.getByRole("button", {
    name: "Change role for Mateo",
    exact: true,
  });
  await _tabTo({
    page,
    target: trigger,
  });
  await page.keyboard.press("Enter");
  const role = page.getByRole("dialog").getByRole("combobox");
  await _tabTo({
    page,
    target: role,
  });
  await page.keyboard.press("v");
  await page.keyboard.press("Tab");
  await expect(role).toHaveValue("viewer");
  return trigger;
}

async function _openInvitationWithKeyboard(page: Page): Promise<void> {
  await page.goto("/api/evidence/session/admin?to=/account");
  await _tabTo({
    page,
    target: page.getByRole("link", { name: "Members and groups", exact: true }),
  });
  await page.keyboard.press("Enter");
  await _tabTo({
    page,
    target: page.getByRole("button", { name: "Invite somebody", exact: true }),
  });
  await page.keyboard.press("Enter");
}

async function _tabTo({
  page,
  target,
}: Readonly<{
  page: Page;
  target: Locator;
}>): Promise<void> {
  await expect(target).toBeVisible();
  for (let numTabPresses = 0; numTabPresses < 80; numTabPresses++) {
    if (
      await target.evaluate((element) => {
        return element === document.activeElement;
      })
    ) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
async function _expectDialogFocusTrap(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await _tabTo({
    page,
    target: cancel,
  });
  await page.keyboard.press("Tab");
  const first = dialog.locator(":focus");
  await expect(first).toHaveCount(1);
  await expect(cancel).not.toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
}
test("keyboard invitation entry exposes associated validation and retains rejected input", async ({
  page,
  catalog,
}) => {
  await _openInvitationWithKeyboard(page);
  const email = await _enterInvalidInvitationWithKeyboard(page);
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(
    /Enter a valid email address/,
  );
  await expect(email).toHaveValue("not-an-email");
  await _tabTo({
    page,
    target: email,
  });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("elena@example.com");
  await _tabTo({
    page,
    target: page.getByRole("button", {
      name: "Send the invitation",
      exact: true,
    }),
  });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    /already belongs to a member/,
  );
  await expect(email).toHaveValue("elena@example.com");
  expect(
    await catalog.database.selectFrom("invitations").selectAll().execute(),
  ).toHaveLength(1);
});
[
  "Change role for Mateo",
  "Remove Mateo",
  "Sign out Safari on iPhone for Abuela Rosa",
].forEach((name) => {
  test(`keyboard ${name} traps focus and Escape restores the trigger`, async ({
    page,
  }) => {
    await page.goto("/api/evidence/session/admin?to=/members");
    const trigger = page.getByRole("button", { name, exact: true });
    await _tabTo({
      page,
      target: trigger,
    });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await _expectDialogFocusTrap(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
test("keyboard committed role change returns to the directory when its trigger is disabled", async ({
  page,
  catalog,
}) => {
  const trigger = await _draftViewerRoleWithKeyboard(page);
  await page.route("**/api/me", (route) => {
    return route.fulfill({
      status: 503,
      json: { error: "unavailable", message: "Account read unavailable" },
    });
  });
  await _tabTo({
    page,
    target: page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true }),
  });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Member administration", exact: true }),
  ).toBeFocused();
  expect(
    (
      await catalog.database
        .selectFrom("members")
        .select("role")
        .where("id", "=", catalog.secondAdmin)
        .executeTakeFirstOrThrow()
    ).role,
  ).toBe("viewer");
  await _tabTo({
    page,
    target: page.getByRole("button", {
      name: "Refresh your account",
      exact: true,
    }),
  });
});
