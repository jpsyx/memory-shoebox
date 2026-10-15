import type { Locator, Page } from "@playwright/test";

import { expect } from "../admin.fixtures.ts";

/** Shared scenario fixture. */
export async function clickDisabledPlayback(button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await button.scrollIntoViewIfNeeded();
  expect(
    await button.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        ),
      );
    }),
  ).toBe(true);
  const bounds = (await button.boundingBox())!;
  // A physical pointer can reach aria-disabled controls; no forced locator click.
  await button
    .page()
    .mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}
/** Shared scenario fixture. */
export async function expectDisabledPlayback(page: Page): Promise<void> {
  const video = page.locator("video");
  await video.evaluate((element: HTMLVideoElement) => {
    const nativePlay = element.play;
    element.dataset.disabledPlayCalls = "0";
    element.play = function (...args) {
      element.dataset.disabledPlayCalls = String(
        Number(element.dataset.disabledPlayCalls) + 1,
      );
      return Reflect.apply(nativePlay, this, args);
    };
  });
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toHaveAttribute("aria-disabled", "true");
  await play.focus();
  await expect(play).toBeFocused();
  for (const key of ["Enter", "Space"]) {
    await page.keyboard.press(key);
    await expect(video).toHaveAttribute("data-disabled-play-calls", "0");
    await expect(play).toBeFocused();
  }
  await clickDisabledPlayback(play);
  await expect(video).toHaveAttribute("data-disabled-play-calls", "0");
  await expect(video).toHaveJSProperty("paused", true);
  await expect(play).toHaveAttribute("aria-disabled", "true");
}
/** Shared scenario fixture. */
export async function seekVideo(
  video: Locator,
  atSeconds: number,
): Promise<void> {
  // WebKit honors metadata-only preload until the viewer requests playback.
  await video.page().getByRole("button", { name: "Play", exact: true }).click();
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
/** Shared scenario fixture. */
export async function expectWithinVideoPlayer(target: Locator): Promise<void> {
  const player = target
    .page()
    .getByRole("group", { name: "Video player", exact: true });
  const playerBounds = await player.boundingBox();
  const targetBounds = await target.boundingBox();
  expect(playerBounds).not.toBeNull();
  expect(targetBounds).not.toBeNull();
  expect(targetBounds!.x).toBeGreaterThanOrEqual(playerBounds!.x);
  expect(targetBounds!.y).toBeGreaterThanOrEqual(playerBounds!.y);
  expect(targetBounds!.x + targetBounds!.width).toBeLessThanOrEqual(
    playerBounds!.x + playerBounds!.width,
  );
  expect(targetBounds!.y + targetBounds!.height).toBeLessThanOrEqual(
    playerBounds!.y + playerBounds!.height,
  );
}
/** Shared scenario fixture. */
export async function chooseVisiblePlaybackSpeeds(page: Page): Promise<void> {
  await [0.5, 1, 1.5, 2].reduce(async (previousSelection, speed) => {
    await previousSelection;
    await page.getByRole("combobox", { name: "Playback speed" }).click();
    const option = page.getByRole("option", { name: `${speed}×`, exact: true });
    await expect(option).toBeVisible();
    await option.scrollIntoViewIfNeeded();
    await expectWithinVideoPlayer(
      page.getByRole("listbox", { name: "Playback speed" }),
    );
    await expectWithinVideoPlayer(option);
    await option.click();
    await expect(page.locator("video")).toHaveJSProperty("playbackRate", speed);
  }, Promise.resolve());
}
/** Shared scenario fixture. */
export async function postAnchoredComment(page: Page): Promise<void> {
  const video = page.locator("video");
  await seekVideo(video, 4);
  const composer = page.getByRole("textbox", { name: "Write a comment" });
  await composer.fill("That little wave at the camera!");
  await seekVideo(video, 7);
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
