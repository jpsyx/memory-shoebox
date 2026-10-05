import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";

async function tabTo(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  for (let count = 0; count < 80; count++) {
    if (
      await target.evaluate((element) => {
        return element === document.activeElement;
      })
    )
      break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function checkTrap(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await tabTo(page, cancel);
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
  await page.goto("/api/evidence/session/admin?to=/account");
  await tabTo(
    page,
    page.getByRole("link", { name: "Members and groups", exact: true }),
  );
  await page.keyboard.press("Enter");
  await tabTo(
    page,
    page.getByRole("button", { name: "Invite somebody", exact: true }),
  );
  await page.keyboard.press("Enter");
  const email = page.getByLabel("Their email", { exact: true });
  await tabTo(page, email);
  await page.keyboard.type("not-an-email");
  await tabTo(
    page,
    page.getByRole("button", { name: "Send the invitation", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(
    /Enter a valid email address/,
  );
  await expect(email).toHaveValue("not-an-email");
  await tabTo(page, email);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("elena@example.com");
  await tabTo(
    page,
    page.getByRole("button", { name: "Send the invitation", exact: true }),
  );
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

for (const name of [
  "Change role for Mateo",
  "Remove Mateo",
  "Sign out Safari on iPhone for Abuela Rosa",
]) {
  test(`keyboard ${name} traps focus and Escape restores the trigger`, async ({
    page,
  }) => {
    await page.goto("/api/evidence/session/admin?to=/members");
    const trigger = page.getByRole("button", { name, exact: true });
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await checkTrap(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("keyboard committed role change returns to the directory when its trigger is disabled", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/evidence/session/admin?to=/members");
  const trigger = page.getByRole("button", {
    name: "Change role for Mateo",
    exact: true,
  });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");
  const role = page.getByRole("dialog").getByRole("combobox");
  await tabTo(page, role);
  await page.keyboard.press("v");
  await page.keyboard.press("Tab");
  await expect(role).toHaveValue("viewer");
  await page.route("**/api/me", (route) => {
    return route.fulfill({
      status: 503,
      json: { error: "unavailable", message: "Account read unavailable" },
    });
  });
  await tabTo(
    page,
    page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }),
  );
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
  await tabTo(
    page,
    page.getByRole("button", { name: "Refresh your account", exact: true }),
  );
});
