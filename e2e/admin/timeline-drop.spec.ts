import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";
import type { createAcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";

type FilePayload = { name: string; type: string; base64: string };

async function _makeFilePayloadsFromFixtures(): Promise<FilePayload[]> {
  const photo = await readFile(
    new URL("../fixtures/cartoon-media/web/burst_008.jpg", import.meta.url),
  );
  const video = await readFile(
    new URL("../fixtures/upload/h264-clip.mp4", import.meta.url),
  );
  return [
    ...Array.from({ length: 4 }, (_, position) => {
      return {
        name: `photo-${position + 1}.jpg`,
        type: "image/jpeg",
        base64: photo.toString("base64"),
      };
    }),
    { name: "video.mp4", type: "video/mp4", base64: video.toString("base64") },
  ];
}

async function _makeDragDataFromFiles(
  page: Page,
  files: readonly FilePayload[],
) {
  return page.evaluateHandle((payloads) => {
    const dataTransfer = new DataTransfer();
    payloads.forEach((file) => {
      const bytes = Uint8Array.from(atob(file.base64), (letter) => {
        return letter.charCodeAt(0);
      });
      dataTransfer.items.add(new File([bytes], file.name, { type: file.type }));
    });
    return dataTransfer;
  }, files);
}

async function _capture(page: Page, name: string): Promise<void> {
  if (process.env.CAPTURE_TIMELINE_DROP !== "1") {
    return;
  }
  const directory = fileURLToPath(
    new URL("../../.playwright-mcp/timeline-drop/", import.meta.url),
  );
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: `${directory}/${name}.png`,
    animations: "disabled",
  });
}

async function _expectDraftOverview(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/upload\?session=/);
  const overview = page.getByRole("region", { name: "What is going up" });
  await expect(
    overview.getByText("Photos", { exact: true }).locator(".."),
  ).toHaveText("4Photos");
  await expect(
    overview.getByText("Video", { exact: true }).locator(".."),
  ).toHaveText("1Video");
  await expect(overview.getByText("To upload", { exact: true })).toBeVisible();
  await expect(overview).not.toContainText(/Chosen|Days|To send/);
  await expect(page.getByText("Drop photos and videos here")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    }),
  ).toBe(true);
}

async function _expectPersistedDraft(
  catalog: Readonly<Awaited<ReturnType<typeof createAcceptanceCatalog>>>,
): Promise<void> {
  const files = await catalog.database
    .selectFrom("upload_files")
    .selectAll()
    .execute();
  expect(
    files
      .map((file) => {
        return file.original_filename;
      })
      .sort(),
  ).toEqual([
    "photo-1.jpg",
    "photo-2.jpg",
    "photo-3.jpg",
    "photo-4.jpg",
    "video.mp4",
  ]);
  const session = await catalog.database
    .selectFrom("upload_sessions")
    .select("state")
    .executeTakeFirstOrThrow();
  expect(session.state).toBe("draft");
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`${viewport.name} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme });
      test("timeline drop opens a populated, unarmed Upload draft", async ({
        page,
        catalog,
      }) => {
        await page.goto("/api/evidence/session/admin?to=/");
        await expect(
          page.getByRole("link", { name: "Add", exact: true }),
        ).toBeVisible();
        const dataTransfer = await _makeDragDataFromFiles(
          page,
          await _makeFilePayloadsFromFixtures(),
        );
        try {
          await page
            .locator("body")
            .dispatchEvent("dragenter", { dataTransfer });
          const dropzone = page.getByRole("region", {
            name: "Drop files to upload",
          });
          await expect(dropzone).toBeVisible();
          await expect(dropzone.locator("..")).toHaveCSS("opacity", "1");
          await _capture(page, `${viewport.name}-${colorScheme}-overlay`);
          await dropzone.dispatchEvent("drop", { dataTransfer });
          await _expectDraftOverview(page);
          await _expectPersistedDraft(catalog);
          await _capture(page, `${viewport.name}-${colorScheme}-draft`);
        } finally {
          await dataTransfer.dispose();
        }
      });
    });
  }
}
