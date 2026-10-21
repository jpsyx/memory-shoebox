import { expect, test } from "../../admin.fixtures.ts";

import {
  chooseVisiblePlaybackSpeeds,
  expectWithinVideoPlayer,
  postAnchoredComment,
  seekVideo,
} from "./video-conversationsTestHelpers.ts";

test("video comments, replies and timed reactions persist through a reload", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await postAnchoredComment(page);
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

  await seekVideo({ video: page.locator("video"), atSeconds: 6 });
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

[320, 390].forEach((width) => {
  test(`video conversation fits a ${width}px phone and accepts a whole-video comment`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(
      `/api/evidence/session/viewer?to=/items/${catalog.videoId}`,
    );
    await seekVideo({ video: page.locator("video"), atSeconds: 3 });
    await chooseVisiblePlaybackSpeeds(page);
    await expectWithinVideoPlayer(
      page.getByRole("button", { name: "Enter full screen", exact: true }),
    );
    await page.getByRole("combobox", { name: "Playback speed" }).click();
    await page.screenshot({
      path: `/tmp/memory-select-video-speed-${width}.png`,
    });
    await page.getByRole("option", { name: "2×", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Write a comment" })
      .fill("Such a lovely day.");
    await page
      .getByRole("button", { name: "Comment at 0:03; switch to whole video" })
      .click();
    await page
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
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
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  await chooseVisiblePlaybackSpeeds(page);
  await page
    .getByRole("button", { name: "2 moments near 0:04", exact: true })
    .click();
  const moments = page.getByRole("list", { name: "Moments near 0:04" });
  await expect(moments).toBeVisible();
  expect(
    await moments.evaluate((element) => {
      const host = element.closest("[data-item-theater-host]");
      return (
        host !== null &&
        (!document.fullscreenElement || document.fullscreenElement === host)
      );
    }),
  ).toBe(true);
});

test("shortcut comments and the heart-first comment reaction bar persist", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  await seekVideo({ video: page.locator("video"), atSeconds: 4 });
  const composer = page.getByRole("textbox", { name: "Write a comment" });
  await composer.fill("Look at that smile!");
  await composer.press("ControlOrMeta+Enter");
  const comment = page
    .getByRole("article")
    .filter({ hasText: "Look at that smile!" });
  await expect(comment).toBeVisible();
  await comment.getByRole("button", { name: "React with Love" }).click();
  const loved = comment.getByRole("button", { name: "Remove Love reaction" });
  await expect(loved).toBeVisible();
  await composer.hover();
  await loved.hover();
  const bar = page.getByRole("dialog", { name: "Choose a reaction" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Wow", exact: true }).click();
  await expect(
    comment.getByRole("button", { name: "Remove Wow reaction" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    comment.getByRole("button", { name: "Remove Wow reaction" }),
  ).toBeVisible();
  await expect(
    comment.getByRole("button", { name: "0:04 Go to this moment" }),
  ).toBeVisible();
});
