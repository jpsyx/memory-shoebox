import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../admin.fixtures.ts";

async function _enterFullScreenFromMedia({
  page,
  media,
  kind,
}: Readonly<{
  page: Page;
  media: Locator;
  kind: "photo" | "video";
}>): Promise<Locator> {
  if (kind === "photo") {
    const bounds = (await media.boundingBox())!;
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
  } else {
    await page
      .getByLabel("Video player", { exact: true })
      .getByRole("button", { name: "Enter full screen", exact: true })
      .click();
  }
  const fullScreen = page.getByRole("dialog", {
    name: "Full screen",
    exact: true,
  });
  if (
    await page.evaluate(() => {
      return document.fullscreenEnabled;
    })
  ) {
    await expect
      .poll(() => {
        return fullScreen.evaluate((element) => {
          return document.fullscreenElement === element;
        });
      })
      .toBe(true);
  }
  return fullScreen;
}

[1440, 390].forEach((width) => {
  (["photo", "video"] as const).forEach((kind) => {
    test(`${kind} media entry opens the shared full-screen host at ${width}px`, async ({
      page,
      catalog,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const itemId = kind === "photo" ? catalog.itemId : catalog.videoId;
      await page.goto(`/api/evidence/session/admin?to=/items/${itemId}`);
      const media =
        kind === "photo"
          ? page.getByRole("img", { name: "A family memory" })
          : page.locator("video");
      await expect(media).toBeVisible();
      const originalMedia = await media.elementHandle();
      const composer = await page
        .getByRole("textbox", { name: "Write a comment" })
        .elementHandle();
      const fullScreen = await _enterFullScreenFromMedia({ page, media, kind });
      await expect(fullScreen).toBeVisible();
      await expect(
        fullScreen.getByRole("button", { name: /^Open comments,/ }),
      ).toBeVisible();
      expect(
        await originalMedia!.evaluate((element) => {
          return element.isConnected;
        }),
      ).toBe(true);
      expect(
        await composer!.evaluate((element) => {
          return element.isConnected;
        }),
      ).toBe(true);
      await fullScreen
        .getByRole("button", { name: "Back", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Enter full screen", exact: true }),
      ).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`));
    });
  });
});
