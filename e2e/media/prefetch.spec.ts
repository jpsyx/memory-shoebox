import type { MediaPreview, MediaSource } from "@memory-shoebox/shared";
import { test, expect } from "./media.fixtures.ts";
import { expectCurrentPhotoDecoded } from "./measurements.ts";

test("native image warming is reused by the normal viewer without a second media body", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/media-evidence/session");
  const itemId = catalog.itemIds[1011]!;
  const offset = catalog.getTransfers().length;
  const source = await page.evaluate(async (id): Promise<MediaSource> => {
    const response = await fetch("/api/media/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds: [id], purpose: "speculative-preview" }),
    });
    if (!response.ok) {
      throw new Error(`Preview failed: ${response.status}`);
    }
    const { items } = (await response.json()) as { items: MediaPreview[] };
    const display = items[0]!.media.display!;
    const harnessUrl = "/api/media-evidence/image-loader.js";
    const { loadSpeculativeMedia } = await import(harnessUrl);
    const warmed = await loadSpeculativeMedia(
      { itemId: id, source: display, kind: "photo", rank: 0, decode: true },
      new AbortController().signal,
    );
    warmed.release();
    return display;
  }, itemId);
  expect(new URL(source.url).origin).not.toBe(catalog.origin);
  expect(new URL(source.url).searchParams.has("X-Amz-Signature")).toBe(true);
  const warmTransfers = catalog
    .getTransfers()
    .slice(offset)
    .filter((transfer) => {
      return transfer.objectId.includes(itemId);
    });
  expect(warmTransfers).toHaveLength(1);
  expect(warmTransfers[0]!.bodyBytes).toBe(21746);
  const displayOffset = catalog.getTransfers().length;
  await page.goto(`/items/${itemId}`);
  await expectCurrentPhotoDecoded(page);
  await expect(
    page.locator('[data-photo-surface="viewer"] img'),
  ).toHaveAttribute("src", source.url);
  const displayTransfers = catalog
    .getTransfers()
    .slice(displayOffset)
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/display`);
    });
  expect(
    displayTransfers.reduce((bytes, transfer) => {
      return bytes + transfer.bodyBytes;
    }, 0),
  ).toBe(0);
  const allDisplayTransfers = catalog
    .getTransfers()
    .slice(offset)
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/display`);
    });
  expect(
    allDisplayTransfers.reduce((bytes, transfer) => {
      return bytes + transfer.bodyBytes;
    }, 0),
  ).toBe(21746);
});

test("an aborted native image settles only after its unavoidable transfer", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/media-evidence/session");
  const itemId = catalog.itemIds[1013]!;
  const offset = catalog.getTransfers().length;
  const failureName = await page.evaluate(async (id) => {
    const response = await fetch("/api/media/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds: [id], purpose: "speculative-preview" }),
    });
    const { items } = (await response.json()) as { items: MediaPreview[] };
    const harnessUrl = "/api/media-evidence/image-loader.js";
    const { loadSpeculativeMedia } = await import(harnessUrl);
    const controller = new AbortController();
    const pending = loadSpeculativeMedia(
      {
        itemId: id,
        source: items[0]!.media.display!,
        kind: "photo",
        rank: 0,
        decode: true,
      },
      controller.signal,
    );
    controller.abort();
    try {
      await pending;
      return "unexpected-success";
    } catch (failure) {
      return failure instanceof Error ? failure.name : "unknown";
    }
  }, itemId);
  expect(failureName).toBe("AbortError");
  const transfers = catalog
    .getTransfers()
    .slice(offset)
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/display`);
    });
  expect(transfers).toHaveLength(1);
  expect(transfers[0]!.bodyBytes).toBe(21746);
});
