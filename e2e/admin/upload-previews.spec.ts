import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";
import type { createAcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";
import { createColdViteServer } from "./support/createColdViteServer.ts";
import { isGoogleChromeInstalled } from "../support/uploadHarnessHelpers.ts";

// The bundled headless Chromium cannot decode phone-recorded HEVC video.
test.use({
  channel: async ({ browserName }, provide) => {
    await provide(browserName === "chromium" ? "chrome" : undefined);
  },
});
test.skip(({ browserName }) => {
  return browserName === "chromium" && !isGoogleChromeInstalled();
}, "Install Google Chrome to verify HEVC MOV previews.");

/** Valid originals exercise native image, WASM HEIC and video decoding. */
const PREVIEW_FIXTURES = [
  { filename: "portrait-orientation-6.jpg", capturedOn: "2026-05-01" },
  { filename: "heic-rotated.heic", capturedOn: "2026-05-02" },
  { filename: "h264-clip.mp4", capturedOn: "2026-05-04" },
  { filename: "hevc-clip.mov", capturedOn: "2026-05-05" },
] as const;

async function _expectDecodedPreviews(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Put 4 up" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Put it all up." }),
  ).toBeFocused();
  await PREVIEW_FIXTURES.reduce(async (previous, { filename, capturedOn }) => {
    await previous;
    const day = page.getByRole("region", { name: capturedOn, exact: true });
    // A skipped pile has estimated height; align its day header, not its center.
    await day.evaluate((element) => {
      element.scrollIntoView({ block: "start" });
    });
    const image = day.getByRole("img", { name: filename, exact: true });
    await expect(image).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => {
        return image.evaluate((element: HTMLImageElement) => {
          return element.complete && element.naturalWidth > 0;
        });
      })
      .toBe(true);
  }, Promise.resolve());
  await expect(
    page.getByRole("button", { name: "Choose the files again" }),
  ).toHaveCount(0);
}

async function _pickPreviewFixtures(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(
    PREVIEW_FIXTURES.map(({ filename }) => {
      return fileURLToPath(
        new URL(`../fixtures/upload/${filename}`, import.meta.url),
      );
    }),
  );
}

async function _expectRecoveredHeicPreview(page: Page): Promise<void> {
  await page
    .getByRole("region", { name: "2026-05-02", exact: true })
    .evaluate((element) => {
      element.scrollIntoView({ block: "start" });
    });
  const image = page.getByRole("img", { name: "IMG_1504.heic", exact: true });
  await expect(image).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => {
      return image.evaluate((element: HTMLImageElement) => {
        return element.complete && element.naturalWidth > 0;
      });
    })
    .toBe(true);
}

async function _pickHeicOriginal({
  page,
  original,
  fileId,
}: Readonly<{
  page: Page;
  original: Readonly<{ mimeType: string; buffer: Uint8Array }>;
  fileId?: string;
}>): Promise<void> {
  const declaration = fileId
    ? page.waitForResponse((response) => {
        return (
          response.url().endsWith("/manifest") &&
          response.request().method() === "PATCH"
        );
      })
    : undefined;
  // setInputFiles infers a MIME type for empty values, unlike some OS pickers.
  const pickedType = await page.locator('input[type="file"]').evaluate(
    (element: HTMLInputElement, { bytes, mimeType }) => {
      const transfer = new DataTransfer();
      const file = new File([new Uint8Array(bytes)], "IMG_1504.heic", {
        type: mimeType,
      });
      transfer.items.add(file);
      element.files = transfer.files;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return file.type;
    },
    { bytes: Array.from(original.buffer), mimeType: original.mimeType },
  );
  expect(pickedType).toBe(original.mimeType);
  if (declaration) {
    const response = await declaration;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({
      files: [{ fileId, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }],
    });
  }
}

async function _expectRecoveredHeicRow({
  catalog,
  fileId,
}: Readonly<{
  catalog: Readonly<Awaited<ReturnType<typeof createAcceptanceCatalog>>>;
  fileId: string;
}>): Promise<void> {
  expect(
    await catalog.database.selectFrom("upload_files").select("id").execute(),
  ).toEqual([{ id: fileId }]);
  expect(
    (
      await catalog.database
        .selectFrom("upload_sessions")
        .select("state")
        .executeTakeFirstOrThrow()
    ).state,
  ).toBe("draft");
}

test("production draft renders JPEG, HEIC, MP4 and MOV previews", async ({
  page,
}) => {
  await page.goto("/api/evidence/session/admin?to=/upload");
  await _pickPreviewFixtures(page);
  await _expectDecodedPreviews(page);
});

[
  { name: "empty", mimeType: "" },
  { name: "generic", mimeType: "application/octet-stream" },
].forEach(({ name, mimeType }) => {
  test(`restored HEIC draft retains its row and preview with ${name} browser MIME metadata`, async ({
    page,
    catalog,
  }) => {
    const original = {
      mimeType,
      buffer: await readFile(
        new URL("../fixtures/upload/heic-rotated.heic", import.meta.url),
      ),
    };
    await page.goto("/api/evidence/session/admin?to=/upload");
    await _pickHeicOriginal({ page, original });
    await expect(page.getByRole("button", { name: "Put 1 up" })).toBeEnabled();
    const savedRow = await catalog.database
      .selectFrom("upload_files")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(savedRow.content_hash).toBeNull();

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Choose the files again", exact: true }),
    ).toBeVisible();
    await _pickHeicOriginal({ page, original, fileId: savedRow.id });
    await expect(
      page.getByRole("button", { name: "Choose the files again", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Put 1 up" })).toBeEnabled();
    await _expectRecoveredHeicRow({ catalog, fileId: savedRow.id });
    await _expectRecoveredHeicPreview(page);
  });
});

test("a JPEG smaller than the thumbnail target still has a decoded preview", async ({
  page,
}) => {
  await page.goto("/api/evidence/session/admin?to=/upload");
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e89b37";
    context.fillRect(0, 0, 64, 48);
    return canvas.toDataURL("image/jpeg").split(",")[1]!;
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "small.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  await expect(page.getByRole("button", { name: "Put 1 up" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Put it all up." }),
  ).toBeFocused();
  await page
    .getByRole("region", { name: "The days in this batch" })
    .getByRole("region")
    .evaluate((element) => {
      element.scrollIntoView({ block: "start" });
    });
  const image = page.getByRole("img", { name: "small.jpg", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => {
      return image.evaluate((element: HTMLImageElement) => {
        return element.naturalWidth;
      });
    })
    .toBe(64);
});

test("first selection on a cold development server retains every preview without reloading", async ({
  page,
  catalog,
}) => {
  test.setTimeout(60_000);
  const server = await createColdViteServer(catalog.origin);
  try {
    await page.goto(`${server.origin}/api/evidence/session/admin?to=/upload`);
    const documentStartedAt = await page.evaluate(() => {
      return performance.timeOrigin;
    });
    await _pickPreviewFixtures(page);
    await _expectDecodedPreviews(page);
    expect(
      await page.evaluate(() => {
        return performance.timeOrigin;
      }),
    ).toBe(documentStartedAt);
    if (process.env.CAPTURE_UPLOAD_PREVIEWS === "1") {
      const directory = fileURLToPath(
        new URL("../../.playwright-mcp/upload-previews/", import.meta.url),
      );
      await mkdir(directory, { recursive: true });
      await page
        .getByRole("region", { name: "2026-05-02", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${directory}/cold-development.png`,
        animations: "disabled",
      });
    }
  } finally {
    await server.close();
  }
});
