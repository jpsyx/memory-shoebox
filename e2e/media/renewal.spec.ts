import { writeFile } from "node:fs/promises";
import { test, expect } from "./media.fixtures.ts";
import { expectCurrentPhotoDecoded } from "./mediaMeasurementHelpers.ts";

test("renews an expired selected original and preserves paused playback without another open", async ({
  page,
  catalog,
  browserName,
}) => {
  const itemId = catalog.itemIds[31]!;
  await catalog.database
    .deleteFrom("item_renditions")
    .where("item_id", "=", itemId)
    .where("purpose", "in", ["video_mp4", "video_webm"])
    .execute();
  let detailGets = 0;
  const renewals: unknown[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === `/api/items/${itemId}` &&
      request.method() === "GET"
    ) {
      detailGets += 1;
    }
    if (new URL(request.url()).pathname === "/api/media/preview") {
      renewals.push(request.postDataJSON());
    }
  });
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${itemId}`);
  const video = page.locator("video");
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return node.readyState;
      });
    })
    .toBeGreaterThanOrEqual(1);
  const initial = await video.evaluate((node: HTMLVideoElement) => {
    node.pause();
    node.currentTime = 3.25;
    node.playbackRate = 1.5;
    node.muted = true;
    node.volume = 0.35;
    node.dataset.renewalNode = "original";
    return {
      url: node.currentSrc,
      time: node.currentTime,
      rate: node.playbackRate,
      volume: node.volume,
      muted: node.muted,
    };
  });
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return node.seeking;
      });
    })
    .toBe(false);
  expect(initial.url).toContain("/original?");
  catalog.advanceClock(3_601_000);
  await page.clock.setFixedTime(new Date(Date.now() + 3_601_000));
  await video.evaluate((node: HTMLVideoElement) => {
    node.currentTime = 5.25;
  });
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return node.currentSrc;
      });
    })
    .not.toBe(initial.url);
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return node.readyState >= 2 && !node.seeking;
      });
    })
    .toBe(true);
  const restored = await video.evaluate((node: HTMLVideoElement) => {
    return {
      time: node.currentTime,
      paused: node.paused,
      rate: node.playbackRate,
      volume: node.volume,
      muted: node.muted,
      owner: node.dataset.renewalNode,
    };
  });
  expect(restored.time).toBeCloseTo(5.25, 1);
  expect(restored).toMatchObject({
    paused: true,
    rate: 1.5,
    volume: 0.35,
    muted: true,
    owner: "original",
  });
  expect(detailGets).toBe(1);
  expect(renewals).toContainEqual({
    itemIds: [itemId],
    purpose: "selected-view",
  });
  await page.screenshot({
    path: `tmp/media-loading/a6-renewal-${browserName}.png`,
  });
  await writeFile(
    `tmp/media-loading/a6-renewal-${browserName}.json`,
    JSON.stringify(
      {
        initial,
        restored,
        detailGets,
        renewals,
        transfers: catalog.getTransfers(),
      },
      null,
      2,
    ),
  );
});

test("renews a decoded photo on return without an actual-detail read", async ({
  page,
  catalog,
}) => {
  const itemId = catalog.itemIds[1]!;
  let detailGets = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === `/api/items/${itemId}` &&
      request.method() === "GET"
    ) {
      detailGets += 1;
    }
  });
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${itemId}`);
  await expectCurrentPhotoDecoded(page);
  const initial = await page
    .locator('[data-photo-surface="viewer"] picture img')
    .getAttribute("src");
  catalog.advanceClock(3_601_000);
  await page.clock.setFixedTime(new Date(Date.now() + 3_601_000));
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await expect
    .poll(() => {
      return page
        .locator('[data-photo-surface="viewer"] picture img')
        .last()
        .getAttribute("src");
    })
    .not.toBe(initial);
  await expectCurrentPhotoDecoded(page);
  expect(
    await page
      .locator('[data-photo-surface="viewer"] picture img')
      .getAttribute("src"),
  ).not.toBe(initial);
  expect(detailGets).toBe(1);
});

test("checks an expired lease before a play gesture and continues playing", async ({
  page,
  catalog,
}) => {
  const itemId = catalog.itemIds[31]!;
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${itemId}`);
  const video = page.locator("video");
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return node.readyState;
      });
    })
    .toBeGreaterThanOrEqual(1);
  const initialUrl = await video.evaluate((node: HTMLVideoElement) => {
    node.muted = true;
    node.currentTime = 2;
    return node.currentSrc;
  });
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return node.seeking;
      });
    })
    .toBe(false);
  catalog.advanceClock(3_601_000);
  await page.clock.setFixedTime(new Date(Date.now() + 3_601_000));
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return node.currentSrc;
      });
    })
    .not.toBe(initialUrl);
  await expect
    .poll(() => {
      return video.evaluate((node: HTMLVideoElement) => {
        return !node.paused && node.currentTime > 2;
      });
    })
    .toBe(true);
  expect(
    catalog.getTransfers().filter((transfer) => {
      return transfer.status === 403;
    }),
  ).toEqual([]);
});

test("offline return retains the decoded photo and renews safely after reconnect", async ({
  page,
  catalog,
}) => {
  const itemId = catalog.itemIds[1]!;
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${itemId}`);
  await expectCurrentPhotoDecoded(page);
  const photo = page.locator('[data-photo-surface="viewer"] picture img');
  const originalSource = await photo.getAttribute("src");
  const initialOpens = await catalog.database
    .selectFrom("item_views")
    .select("open_count")
    .where("item_id", "=", itemId)
    .where("member_id", "=", catalog.memberId)
    .executeTakeFirstOrThrow();
  const failedRenewal = page.waitForEvent("requestfailed", (request) => {
    return (
      new URL(request.url()).pathname === "/api/media/preview" &&
      request.postDataJSON()?.purpose === "selected-view"
    );
  });
  await page.context().setOffline(true);
  catalog.advanceClock(3_601_000);
  await page.clock.setFixedTime(new Date(Date.now() + 3_601_000));
  await page.evaluate(() => {
    return window.dispatchEvent(new Event("focus"));
  });
  await expect(photo).toHaveAttribute("src", originalSource!);
  await expectCurrentPhotoDecoded(page);
  await failedRenewal;
  await page.context().setOffline(false);
  await page.evaluate(() => {
    return window.dispatchEvent(new Event("online"));
  });
  await expect
    .poll(() => {
      return photo.last().getAttribute("src");
    })
    .not.toBe(originalSource);
  await expect(photo).toHaveCount(1);
  await expectCurrentPhotoDecoded(page);
  const finalOpens = await catalog.database
    .selectFrom("item_views")
    .select("open_count")
    .where("item_id", "=", itemId)
    .where("member_id", "=", catalog.memberId)
    .executeTakeFirstOrThrow();
  expect(finalOpens).toEqual(initialOpens);
});

test("source replacement renews the selected immutable rendition without another open", async ({
  page,
  catalog,
}) => {
  const itemId = catalog.itemIds[1]!;
  const replacementId = catalog.itemIds[3]!;
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${itemId}`);
  await expectCurrentPhotoDecoded(page);
  await catalog.database
    .deleteFrom("item_renditions")
    .where("item_id", "=", replacementId)
    .where("purpose", "=", "display")
    .execute();
  await catalog.database
    .updateTable("item_renditions")
    .set({ storage_key: `media/${replacementId}/display` })
    .where("item_id", "=", itemId)
    .where("purpose", "=", "display")
    .execute();
  catalog.advanceClock(3_601_000);
  await page.clock.setFixedTime(new Date(Date.now() + 3_601_000));
  await page.evaluate(() => {
    return window.dispatchEvent(new Event("focus"));
  });
  const photo = page.locator('[data-photo-surface="viewer"] picture img');
  await expect(
    page.locator(
      `[data-photo-surface="viewer"] picture img[src*="/${replacementId}/display"]`,
    ),
  ).toBeAttached();
  await expect(photo).toHaveCount(1);
  await expectCurrentPhotoDecoded(page);
  const opened = await catalog.database
    .selectFrom("item_views")
    .select("open_count")
    .where("item_id", "=", itemId)
    .where("member_id", "=", catalog.memberId)
    .executeTakeFirstOrThrow();
  expect(opened.open_count).toBe(1);
});
