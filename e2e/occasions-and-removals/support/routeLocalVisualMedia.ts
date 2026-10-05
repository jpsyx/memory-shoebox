import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
/** Serve retained generated artwork without an external reference server. */
export async function routeLocalVisualMedia(page: Page): Promise<void> {
  await page.route("https://visual-media.invalid/**", async (route) => {
    const file = new URL(route.request().url()).pathname.endsWith("-thumb.jpg")
      ? "highChair-thumb.jpg"
      : "highChair.jpg";
    await route.fulfill({
      contentType: "image/jpeg",
      body: await readFile(
        new URL(`../../fixtures/cartoon-media/web/${file}`, import.meta.url),
      ),
    });
  });
}
