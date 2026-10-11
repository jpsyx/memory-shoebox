import { readFile } from "node:fs/promises";
import { test, expect } from "./admin.fixtures.ts";

[1440, 390].forEach((width) => {
  test(`upload Delete all confirms unticked files too at ${width}px`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/api/evidence/session/admin?to=/upload");
    const buffer = await readFile(
      new URL("../fixtures/upload/portrait-orientation-6.jpg", import.meta.url),
    );
    await page.locator('input[type="file"]').setInputFiles([
      { name: "first.jpg", mimeType: "image/jpeg", buffer },
      { name: "second.jpg", mimeType: "image/jpeg", buffer },
    ]);
    await expect(
      page.getByRole("button", { name: "Put 2 up", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: /^first.jpg/ }).click();
    await page.getByRole("button", { name: "Delete all", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Remove 2 files?" });
    await expect(dialog).toContainText("cannot be undone");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Put 2 up", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Delete all", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Remove 2 files", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^first.jpg/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /^second.jpg/ })).toHaveCount(
      0,
    );
    expect(
      await catalog.database
        .selectFrom("upload_files")
        .select("original_filename")
        .execute(),
    ).toEqual([]);
    expect(
      await catalog.database
        .selectFrom("items")
        .where("upload_session_id", "is not", null)
        .select("id")
        .execute(),
    ).toEqual([]);
  });
});
