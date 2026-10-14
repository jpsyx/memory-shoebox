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

[1, 2].forEach((deviceScaleFactor) => {
  test.describe(`actual viewer DPR ${deviceScaleFactor}`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor,
      responsivePhotos: true,
    });
    test("warms the selected mobile candidate and reuses its bytes through reversal", async ({
      page,
      catalog,
    }) => {
      await page.goto("/api/media-evidence/session");
      const start = catalog.itemIds[1010]!;
      const target = catalog.itemIds[1011]!;
      const purpose = deviceScaleFactor === 1 ? "thumb" : "display";
      const detailReads: string[] = [];
      page.on("request", (request) => {
        if (/\/api\/items\/[^/]+$/.test(request.url())) {
          detailReads.push(new URL(request.url()).pathname);
        }
      });
      await page.goto(`/items/${start}`);
      await expectCurrentPhotoDecoded(page);
      await expect
        .poll(() => {
          return catalog.getTransfers().filter((transfer) => {
            return (
              transfer.objectId.endsWith(`/${target}/${purpose}`) &&
              transfer.bodyBytes > 0
            );
          }).length;
        })
        .toBe(1);
      expect(detailReads).toEqual([`/api/items/${start}`]);
      const offset = catalog.getTransfers().length;
      await page
        .getByRole("button", { name: "Next photo or video", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
      await expectCurrentPhotoDecoded(page);
      const selected = page.locator(
        '[data-photo-surface="viewer"] picture img',
      );
      const currentSrc = await selected.evaluate((image: HTMLImageElement) => {
        return image.currentSrc;
      });
      expect(new URL(currentSrc).pathname).toContain(`/${target}/${purpose}`);
      expect(
        catalog
          .getTransfers()
          .slice(offset)
          .filter((transfer) => {
            return transfer.objectId.endsWith(`/${target}/${purpose}`);
          })
          .reduce((bytes, transfer) => {
            return bytes + transfer.bodyBytes;
          }, 0),
      ).toBe(0);
      expect(detailReads).toEqual([
        `/api/items/${start}`,
        `/api/items/${target}`,
      ]);
      await page.keyboard.press("ArrowLeft");
      await expect(page).toHaveURL(new RegExp(`/items/${start}$`));
      await expectCurrentPhotoDecoded(page);
      await page.keyboard.press("ArrowRight");
      await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
      await expectCurrentPhotoDecoded(page);
      expect(
        catalog.getTransfers().filter((transfer) => {
          return (
            transfer.objectId.endsWith(`/${target}/${purpose}`) &&
            transfer.bodyBytes > 0
          );
        }),
      ).toHaveLength(1);
    });
    test("fits an uncropped portrait and consumes the warmed portrait source", async ({
      page,
      catalog,
    }, testInfo) => {
      await page.goto("/api/media-evidence/session");
      await page.goto(`/items/${catalog.itemIds[1014]!}`);
      await expectCurrentPhotoDecoded(page);
      const target = catalog.itemIds[1015]!;
      await expect
        .poll(() => {
          return catalog.getTransfers().filter((transfer) => {
            return (
              transfer.objectId.endsWith(`/${target}/display`) &&
              transfer.bodyBytes > 0
            );
          }).length;
        })
        .toBe(1);
      const offset = catalog.getTransfers().length;
      await page.keyboard.press("ArrowRight");
      await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
      await expectCurrentPhotoDecoded(page);
      const image = page.locator('[data-photo-surface="viewer"] picture img');
      const pixels = await image.evaluate((element: HTMLImageElement) => {
        return {
          currentSrc: element.currentSrc,
          width: element.naturalWidth,
          height: element.naturalHeight,
          fit: getComputedStyle(element).objectFit,
        };
      });
      await page.screenshot({
        path: testInfo.outputPath("portrait-decoded.png"),
        fullPage: true,
      });
      expect(pixels.width / pixels.height).toBeCloseTo(1067 / 1600, 2);
      expect(pixels.fit).toBe("contain");
      expect(new URL(pixels.currentSrc).pathname).toContain(
        `/${target}/display`,
      );
      expect(
        catalog
          .getTransfers()
          .slice(offset)
          .filter((transfer) => {
            return transfer.objectId.endsWith(`/${target}/display`);
          })
          .reduce((bytes, transfer) => {
            return bytes + transfer.bodyBytes;
          }, 0),
      ).toBe(0);
    });
  });
});

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
