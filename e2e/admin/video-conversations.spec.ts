import type { Locator, Page } from "@playwright/test";
import { itemDetailSchema } from "@memory-shoebox/shared";
import { test, expect } from "./admin.fixtures.ts";
import { insertRendition } from "../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";

async function _seekVideo(video: Locator, atSeconds: number): Promise<void> {
  // WebKit honors metadata-only preload until the viewer requests playback.
  await video
    .page()
    .getByRole("button", { name: "Play video", exact: true })
    .click();
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.readyState;
      });
    })
    .toBeGreaterThanOrEqual(2);
  await video.evaluate((element: HTMLVideoElement, position) => {
    element.pause();
    element.currentTime = position;
  }, atSeconds);
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.currentTime;
      });
    })
    .toBeCloseTo(atSeconds, 1);
}

async function _postAnchoredComment(page: Page): Promise<void> {
  const video = page.locator("video");
  await _seekVideo(video, 4);
  const composer = page.getByRole("textbox", { name: "Write a comment" });
  await composer.fill("That little wave at the camera!");
  await _seekVideo(video, 7);
  await expect(
    page.getByRole("button", {
      name: "Comment at 0:04; switch to whole video",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    page.getByText("That little wave at the camera!", { exact: true }),
  ).toBeVisible();
}

test("video comments, replies and timed reactions persist through a reload", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await _postAnchoredComment(page);
  const comment = await catalog.database
    .selectFrom("comments")
    .selectAll()
    .where("item_id", "=", catalog.videoId)
    .executeTakeFirstOrThrow();
  expect(comment.at_seconds).toBeCloseTo(4, 1);
  expect(comment.parent_comment_id).toBeNull();

  await page.getByRole("button", { name: /^Reply to / }).click();
  await page.getByRole("textbox", { name: /^Reply to / }).fill("I saw it too!");
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(page.getByText("I saw it too!", { exact: true })).toBeVisible();
  const reply = await catalog.database
    .selectFrom("comments")
    .selectAll()
    .where("parent_comment_id", "=", comment.id)
    .executeTakeFirstOrThrow();
  expect(reply.at_seconds).toBe(comment.at_seconds);

  await _seekVideo(page.locator("video"), 6);
  await page.getByRole("button", { name: "React: Laugh", exact: true }).click();
  await expect
    .poll(async () => {
      return catalog.database
        .selectFrom("video_reactions")
        .selectAll()
        .where("item_id", "=", catalog.videoId)
        .execute();
    })
    .toHaveLength(1);
  await page.reload();
  await expect(
    page.getByText("That little wave at the camera!", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("I saw it too!", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /Seek to 0:06: .*reacted 😂/ })
    .click();
  await expect
    .poll(() => {
      return page.locator("video").evaluate((element: HTMLVideoElement) => {
        return element.currentTime;
      });
    })
    .toBeGreaterThanOrEqual(5.9);
});

test("video conversation fits a phone and accepts a whole-video comment", async ({
  page,
  catalog,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await _seekVideo(page.locator("video"), 3);
  await page
    .getByRole("textbox", { name: "Write a comment" })
    .fill("Such a lovely day.");
  await page
    .getByRole("button", { name: "Comment at 0:03; switch to whole video" })
    .click();
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    page.getByText("Such a lovely day.", { exact: true }),
  ).toBeVisible();
  const comment = await catalog.database
    .selectFrom("comments")
    .select("at_seconds")
    .where("item_id", "=", catalog.videoId)
    .executeTakeFirstOrThrow();
  expect(comment.at_seconds).toBeNull();
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  expect(hasOverflow).toBe(false);
});

test("playback retry uses refreshed rendition URLs", async ({
  page,
  catalog,
}) => {
  let numItemReads = 0;
  await page.route(`**/api/items/${catalog.videoId}`, async (route) => {
    const response = await route.fetch();
    const detail = itemDetailSchema.parse(await response.json());
    numItemReads += 1;
    for (const source of Object.values(detail.media.video ?? {})) {
      if (source !== null) {
        source.url += `?version=${numItemReads}`;
      }
    }
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/evidence/media/**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("version") === "1") {
      await route.fulfill({ status: 403, body: "Expired media URL" });
      return;
    }
    await route.continue();
  });
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await expect(
    page.getByText("This video couldn’t play", { exact: true }),
  ).toBeVisible();
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
});

test("grouped moments stay inside the fullscreen player", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  for (const atSeconds of [4, 4.1]) {
    const response = await page.request.put(
      `/api/items/${catalog.videoId}/video-reactions/${crypto.randomUUID()}`,
      { data: { emoji: "❤️", atSeconds } },
    );
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "2 moments near 0:04", exact: true })
    .click();
  const moments = page.getByRole("list", { name: "Moments near 0:04" });
  await expect(moments).toBeVisible();
  expect(
    await moments.evaluate((element) => {
      return document.fullscreenElement?.contains(element);
    }),
  ).toBe(true);
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
    for (const source of Object.values(detail.media.video ?? {})) {
      if (source !== null) {
        source.url += "?refreshed-after-edit=1";
      }
    }
    await route.fulfill({ response, json: detail });
  });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await _seekVideo(page.locator("video"), 4);
  await page.getByLabel("Playback speed").selectOption("1.5");
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
  await _seekVideo(page.locator("video"), 4);
  await expect(
    page.getByRole("slider", { name: "Where in the video" }),
  ).toHaveAttribute("aria-valuenow", "4");
});
