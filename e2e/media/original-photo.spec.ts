import { readFile } from "node:fs/promises";
import { expectCurrentPhotoDecoded } from "./mediaMeasurementHelpers.ts";
import { expect, test } from "./media.fixtures.ts";

test.use({ catalogSize: 80 });
[900, 320].forEach((width) => {
  test(`original-only ${width}px PNG decodes and unlocks neighbor warming`, async ({
    page,
    catalog,
  }, testInfo) => {
    const itemId = catalog.itemIds[41]!;
    const body = await readFile(
      new URL(
        `../fixtures/media-loading/original-${width}.png`,
        import.meta.url,
      ),
    );
    await catalog.setOriginalPhotoFromBytes({
      itemId,
      width,
      height: width === 900 ? 600 : 240,
      body,
    });
    await page.goto("/api/media-evidence/session");
    const detail = await page.request.get(`/api/items/${itemId}`);
    const answer = await detail.json();
    expect(answer.media.thumb === null).toBe(width > 480);
    const offset = catalog.getTransfers().length;
    const originalResponse = page.waitForResponse((response) => {
      return (
        new URL(response.url()).pathname.endsWith(
          `/media/${itemId}/original`,
        ) && response.request().resourceType() === "image"
      );
    });
    await page.goto(`/items/${itemId}`);
    await expectCurrentPhotoDecoded(page);
    const image = page.locator('[data-photo-surface="viewer"] picture img');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", /\/original\?/);
    const response = await originalResponse;
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(await response.body()).toEqual(body);
    expect(
      await image.evaluate((node: HTMLImageElement) => {
        return node.currentSrc;
      }),
    ).toBe(response.url());
    await testInfo.attach("original-png-decoded.json", {
      contentType: "application/json",
      body: JSON.stringify({
        encodedWidth: body.readUInt32BE(16),
        encodedHeight: body.readUInt32BE(20),
        ...(await image.evaluate((node: HTMLImageElement) => {
          return {
            naturalWidth: node.naturalWidth,
            sourcePath: new URL(node.currentSrc).pathname,
            sizes: node.closest("picture")?.querySelector("source")?.sizes,
          };
        })),
      }),
    });
    await expect
      .poll(() => {
        return catalog
          .getTransfers()
          .slice(offset)
          .some((transfer) => {
            return (
              transfer.objectId.includes(catalog.itemIds[42]!) &&
              transfer.bodyBytes > 0
            );
          });
      })
      .toBe(true);
  });
});
