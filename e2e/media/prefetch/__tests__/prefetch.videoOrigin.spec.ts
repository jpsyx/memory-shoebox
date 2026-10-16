import { expect, test } from "../../media.fixtures.ts";

import { expectCurrentPhotoDecoded } from "../../mediaMeasurementHelpers.ts";

test("walks burst edges and mixed media without speculating video bytes", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${catalog.itemIds[2]!}`);
  await expectCurrentPhotoDecoded(page);
  await Array.from({ length: 6 }).reduce(async (previous, _unused, index) => {
    await previous;
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(
      new RegExp(`/items/${catalog.itemIds[index + 3]!}$`),
    );
    await expectCurrentPhotoDecoded(page);
  }, Promise.resolve());
  await page.goto(`/items/${catalog.itemIds[30]!}`);
  await expectCurrentPhotoDecoded(page);
  const videoId = catalog.itemIds[31]!;
  await expect
    .poll(() => {
      return catalog.getTransfers().filter((transfer) => {
        return (
          transfer.objectId.endsWith(`/${videoId}/poster`) &&
          transfer.bodyBytes > 0
        );
      }).length;
    })
    .toBe(1);
  expect(
    catalog.getTransfers().filter((transfer) => {
      return (
        transfer.objectId.includes(videoId) &&
        /\/(original|video_mp4|video_webm)$/.test(transfer.objectId)
      );
    }),
  ).toHaveLength(0);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${videoId}$`));
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.readyState >= 2;
      });
    })
    .toBe(true);
  await video.evaluate((element: HTMLVideoElement) => {
    return element.pause();
  });
  const target = catalog.itemIds[32]!;
  await expect
    .poll(() => {
      return catalog.getTransfers().filter((transfer) => {
        return transfer.objectId.includes(target) && transfer.bodyBytes > 0;
      }).length;
    })
    .toBeGreaterThan(0);
  expect(
    catalog.getTransfers().filter((transfer) => {
      return transfer.objectId.endsWith(`/${videoId}/original`);
    }),
  ).toHaveLength(0);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${videoId}$`));
  await page
    .getByRole("button", { name: "Next photo or video", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
  await expectCurrentPhotoDecoded(page);
});
test.describe("direct video candidate boundary", () => {
  test.use({
    viewport: { width: 450, height: 844 },
    deviceScaleFactor: 1,
    responsivePhotos: true,
  });

  test("promotes and consumes the exact photo candidate warmed from a directly opened video", async ({
    page,
    catalog,
  }) => {
    await page.goto("/api/media-evidence/session");
    const videoId = catalog.itemIds[31]!;
    const target = catalog.itemIds[32]!;
    await page.goto(`/items/${videoId}`);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await expect
      .poll(() => {
        return video.evaluate((element: HTMLVideoElement) => {
          return element.readyState >= 2;
        });
      })
      .toBe(true);
    await video.evaluate((element: HTMLVideoElement) => {
      element.pause();
    });
    await expect
      .poll(() => {
        return catalog.getTransfers().filter((transfer) => {
          return (
            transfer.objectId.endsWith(`/${target}/thumb`) &&
            transfer.bodyBytes > 0
          );
        }).length;
      })
      .toBe(1);
    expect(
      catalog.getTransfers().filter((transfer) => {
        return transfer.objectId.endsWith(`/${target}/display`);
      }),
    ).toHaveLength(0);
    const offset = catalog.getTransfers().length;
    await page
      .getByRole("button", { name: "Next photo or video", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
    await expectCurrentPhotoDecoded(page);
    const currentSrc = await page
      .locator('[data-photo-surface="viewer"] picture img')
      .evaluate((image: HTMLImageElement) => {
        return image.currentSrc;
      });
    expect(new URL(currentSrc).pathname).toContain(`/${target}/thumb`);
    expect(
      catalog
        .getTransfers()
        .slice(offset)
        .filter((transfer) => {
          return transfer.objectId.includes(target);
        })
        .reduce((total, transfer) => {
          return total + transfer.bodyBytes;
        }, 0),
    ).toBe(0);
  });
});
