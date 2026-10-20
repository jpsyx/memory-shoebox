import {
  itemDetailSchema,
  mediaPreviewResponseSchema,
} from "@memory-shoebox/shared";

import { expect, test } from "../../admin.fixtures.ts";

import { insertRendition } from "../../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import {
  expectDisabledPlayback,
  seekVideo,
} from "./video-conversationsTestHelpers.ts";

test("playback retry uses refreshed rendition URLs", async ({
  page,
  catalog,
}) => {
  let numItemReads = 0;
  let numRenewals = 0;
  await page.route(`**/api/items/${catalog.videoId}`, async (route) => {
    const response = await route.fetch();
    const detail = itemDetailSchema.parse(await response.json());
    numItemReads += 1;
    [detail.media.playback].forEach((source) => {
      if (source !== null) {
        source.url += `?version=${numItemReads}`;
      }
    });
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/media/preview", async (route) => {
    const response = await route.fetch();
    const previews = mediaPreviewResponseSchema.parse(await response.json());
    numRenewals += 1;
    previews.items.forEach((preview) => {
      if (preview.media.playback !== null) {
        preview.media.playback.url += `?version=${numRenewals + 1}`;
      }
    });
    await route.fulfill({ response, json: previews });
  });
  await page.route("**/api/evidence/media/**", async (route) => {
    if (
      ["1", "2"].includes(
        new URL(route.request().url()).searchParams.get("version") ?? "",
      )
    ) {
      await route.fulfill({ status: 403, body: "Expired media URL" });
      return;
    }
    await route.continue();
  });
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await expect(
    page.getByText("This video couldn’t play", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enter theater", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Media theater" }),
  ).toBeVisible();
  expect(numRenewals).toBe(1);
  await expectDisabledPlayback(page);
  expect(numRenewals).toBe(1);
  expect(numItemReads).toBe(1);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await expect
    .poll(() => {
      return page.locator("video").evaluate((video: HTMLVideoElement) => {
        return video.readyState;
      });
    })
    .toBeGreaterThanOrEqual(2);
  await expect(
    page.getByText("This video couldn’t play", { exact: true }),
  ).toBeHidden();
  expect(numItemReads).toBe(1);
  expect(numRenewals).toBe(2);
});

test("editing metadata preserves the video's position and playback rate", async ({
  page,
  catalog,
}) => {
  await page.route(`**/api/items/${catalog.videoId}`, async (route) => {
    const response = await route.fetch();
    if (route.request().method() !== "PATCH") {
      await route.fulfill({ response });
      return;
    }
    const detail = itemDetailSchema.parse(await response.json());
    [detail.media.playback].forEach((source) => {
      if (source !== null) {
        source.url += "?refreshed-after-edit=1";
      }
    });
    await route.fulfill({ response, json: detail });
  });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await seekVideo({ video: page.locator("video"), atSeconds: 4 });
  await page
    .getByRole("combobox", { name: "Playback speed", exact: true })
    .click();
  await page.getByRole("option", { name: "1.5×", exact: true }).click();
  await page.getByRole("button", { name: "More video details" }).click();
  await page
    .getByRole("textbox", { name: "Describe this video" })
    .fill("Our Sunday family walk");
  await page
    .getByRole("button", { name: "Save the description", exact: true })
    .click();
  await expect(page.locator("video")).toHaveAttribute(
    "aria-label",
    "Our Sunday family walk",
  );
  await page.getByRole("button", { name: "Close video details" }).click();
  const playback = await page
    .locator("video")
    .evaluate((video: HTMLVideoElement) => {
      return {
        position: video.currentTime,
        rate: video.playbackRate,
        isPaused: video.paused,
      };
    });
  expect(playback.position).toBeCloseTo(4, 1);
  expect(playback.rate).toBe(1.5);
  expect(playback.isPaused).toBe(true);
});

test("plays an original upload without generated video encodings", async ({
  page,
  catalog,
}) => {
  await catalog.database
    .deleteFrom("item_renditions")
    .where("item_id", "=", catalog.videoId)
    .where("purpose", "in", ["video_mp4", "video_webm"])
    .execute();
  await insertRendition(catalog.database, {
    itemId: catalog.videoId,
    purpose: "original",
    storage_key: "evidence/video/video_mp4",
    content_type: "video/mp4",
    width: 960,
    height: 540,
  });
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toBeVisible();
  await expect(
    page.getByText("This video couldn’t play", { exact: true }),
  ).toBeHidden();
  await seekVideo({ video: page.locator("video"), atSeconds: 4 });
  await expect(
    page.getByRole("slider", { name: "Where in the video" }),
  ).toHaveAttribute("aria-valuenow", "4");
});
