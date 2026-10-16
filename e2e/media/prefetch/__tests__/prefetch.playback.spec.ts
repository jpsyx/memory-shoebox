import { writeFile } from "node:fs/promises";

import { expect, test } from "../../media.fixtures.ts";

test("selected optimized video loads metadata without playing or reading its original, then records uninterrupted playback", async ({
  page,
  catalog,
  browserName,
}, testInfo) => {
  const itemId = catalog.itemIds[31]!;
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${itemId}`);
  const video = page.locator("video");
  await expect(video).toHaveAttribute("preload", "metadata");
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.readyState;
      });
    })
    .toBeGreaterThanOrEqual(1);
  expect(
    await video.evaluate((element: HTMLVideoElement) => {
      return {
        paused: element.paused,
        time: element.currentTime,
      };
    }),
  ).toEqual({ paused: true, time: 0 });
  const metadataTransfers = [...catalog.getTransfers()];
  await video.evaluate((element: HTMLVideoElement) => {
    element.muted = true;
    element.dataset.waitingEvents = "0";
    element.addEventListener("waiting", () => {
      if (element.currentTime > 0) {
        element.dataset.waitingEvents = String(
          Number(element.dataset.waitingEvents) + 1,
        );
      }
    });
  });
  const started = performance.now();
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return !element.paused && element.currentTime > 0;
      });
    })
    .toBe(true);
  const startupMs = performance.now() - started;
  await expect
    .poll(
      () => {
        return video.evaluate((element: HTMLVideoElement) => {
          return element.ended;
        });
      },
      {
        timeout: 20000,
      },
    )
    .toBe(true);
  const rebufferEvents = await video.evaluate((element: HTMLVideoElement) => {
    return Number(element.dataset.waitingEvents);
  });
  expect(rebufferEvents).toBe(0);
  const originalBytes = catalog
    .getTransfers()
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/original`);
    })
    .reduce((total, transfer) => {
      return total + transfer.bodyBytes;
    }, 0);
  expect(originalBytes).toBe(0);
  const opened = await catalog.database
    .selectFrom("item_views")
    .select("open_count")
    .where("member_id", "=", catalog.memberId)
    .where("item_id", "=", itemId)
    .executeTakeFirstOrThrow();
  expect(opened.open_count).toBe(1);
  await writeFile(
    testInfo.outputPath("video-playback.json"),
    JSON.stringify(
      {
        browserName,
        startupMs,
        rebufferEvents,
        originalBytes,
        openCount: opened.open_count,
        metadataTransfers,
        transfers: catalog.getTransfers(),
        speculativeVideoMetadataEnabled: false,
      },
      null,
      2,
    ),
  );
});
