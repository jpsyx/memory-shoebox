import { test, expect } from "./admin.fixtures.ts";

[
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test(`base URL saves survive reload and the title returns home at ${viewport.width}px`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/api/evidence/session/admin?to=/settings");
    const input = page.getByLabel("Base URL", { exact: true });
    await input.fill("https://family.example.com");
    await page.getByRole("button", { name: "Save base URL" }).click();
    await expect(page.getByText("The base URL has been saved.")).toBeVisible();
    await expect(input).toBeEnabled();
    await page.reload();
    await expect(input).toHaveValue("https://family.example.com");
    await input.fill("https://draft.example.com");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(input).toHaveValue("https://family.example.com");
    const settings = await page.request.get("/api/public-settings");
    expect(await settings.json()).toMatchObject({
      baseUrl: "https://family.example.com",
    });

    await page.goto("/people");
    const title = page.getByRole("link", {
      name: "The Ruiz Shoebox",
      exact: true,
    });
    await expect(title).toHaveAttribute("href", "/");
    await title.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${catalog.origin}/`);
    await page.getByRole("link", { name: "Find", exact: true }).click();
    await expect(page).toHaveURL(/find=true/);
    await title.click();
    await expect(page).toHaveURL(`${catalog.origin}/`);
  });
});
