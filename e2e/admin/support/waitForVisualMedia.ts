import type { Page } from "@playwright/test";
/** Waits for the fonts and images that determine a browser capture's layout. */
export async function waitForVisualMedia(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => {
        return image.decode().catch(() => {});
      }),
    );
  });
}
