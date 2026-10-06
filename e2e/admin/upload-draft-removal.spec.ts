import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";

async function _pickEightFiles(page: Page): Promise<void> {
  const photo = await readFile(
    new URL("../fixtures/upload/portrait-orientation-6.jpg", import.meta.url),
  );
  const video = await readFile(
    new URL("../fixtures/upload/h264-clip.mp4", import.meta.url),
  );
  await page.locator('input[type="file"]').setInputFiles([
    ...Array.from({ length: 7 }, (_, position) => {
      return {
        name: `photo-${position + 1}.jpg`,
        mimeType: "image/jpeg",
        buffer: photo,
      };
    }),
    { name: "h264-clip.mp4", mimeType: "video/mp4", buffer: video },
  ]);
  await expect(page.getByRole("button", { name: "Put 8 up" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Put it all up." }),
  ).toBeFocused();
}

async function _scrollToPhotos(page: Page): Promise<void> {
  await page
    .getByRole("region", { name: "2026-05-01", exact: true })
    .evaluate((element) => {
      element.scrollIntoView({ block: "start" });
    });
  await expect(
    page.getByRole("img", { name: "photo-1.jpg", exact: true }),
  ).toBeVisible();
}

[
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
].forEach((viewport) => {
  test.describe(viewport.name, () => {
    test.use({ viewport });
    test("confirmed bulk removal persists six survivors after cancelling individual removal", async ({
      page,
      catalog,
    }) => {
      await page.goto("/api/evidence/session/admin?to=/upload");
      await _pickEightFiles(page);
      await _scrollToPhotos(page);
      await page
        .getByRole("button", { name: "Remove photo-1.jpg", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Remove 1 file?" });
      await expect(
        dialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeFocused();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Remove photo-1.jpg", exact: true }),
      ).toBeFocused();
      await page.getByRole("button", { name: /^photo-2.jpg/ }).click();
      await page.getByRole("button", { name: /^photo-1.jpg/ }).click();
      await page.getByRole("button", { name: "Remove", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Remove 2 files?" })
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Put 8 up" }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Remove", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Remove 2 files", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Put 6 up" }),
      ).toBeEnabled();
      const files = await catalog.database
        .selectFrom("upload_files")
        .select("original_filename")
        .execute();
      expect(
        files
          .map((file) => {
            return file.original_filename;
          })
          .sort(),
      ).toEqual([
        "h264-clip.mp4",
        "photo-3.jpg",
        "photo-4.jpg",
        "photo-5.jpg",
        "photo-6.jpg",
        "photo-7.jpg",
      ]);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Put 6 up" }),
      ).toBeEnabled();
      expect(
        await catalog.database
          .selectFrom("items")
          .where("upload_session_id", "is not", null)
          .select("id")
          .execute(),
      ).toEqual([]);
      expect(
        await page.evaluate(() => {
          return document.documentElement.scrollWidth <= window.innerWidth;
        }),
      ).toBe(true);
    });
  });
});

test("loaded thumbnails retain their URLs when scrolling away and back", async ({
  page,
}) => {
  await page.goto("/api/evidence/session/admin?to=/upload");
  await _pickEightFiles(page);
  await _scrollToPhotos(page);
  const image = page.getByRole("img", { name: "photo-1.jpg", exact: true });
  const originalUrl = await image.getAttribute("src");
  await page
    .getByRole("region", { name: "2026-05-04", exact: true })
    .evaluate((element) => {
      element.scrollIntoView({ block: "start" });
    });
  await expect(
    page.getByRole("img", { name: "h264-clip.mp4", exact: true }),
  ).toBeVisible();
  await _scrollToPhotos(page);
  await expect(image).toHaveAttribute("src", originalUrl!);
  await expect(
    page.getByText("Not the best six.", { exact: false }),
  ).toHaveCount(0);
});
