import { test, expect } from "./admin.fixtures.ts";
import type { Locator, Page } from "@playwright/test";

async function _observeNativePlay(video: Locator): Promise<void> {
  await video.evaluate((element: HTMLVideoElement) => {
    const nativePlay = element.play;
    element.dataset.keyboardPlayCalls = "0";
    element.play = function (...args) {
      element.dataset.keyboardPlayCalls = String(
        Number(element.dataset.keyboardPlayCalls) + 1,
      );
      return Reflect.apply(nativePlay, this, args);
    };
  });
}

async function _expectKeyboardPlayback({
  page,
  video,
}: {
  page: Page;
  video: Locator;
}): Promise<void> {
  await _observeNativePlay(video);
  let expectedCalls = 0;
  for (const suffix of ["", " video"]) {
    for (const key of ["Enter", "Space"]) {
      const position = await video.evaluate((element: HTMLVideoElement) => {
        return element.currentTime;
      });
      const play = page.getByRole("button", {
        name: `Play${suffix}`,
        exact: true,
      });
      await play.focus();
      await expect(play).toBeFocused();
      await page.keyboard.press(key);
      await expect(video).toHaveJSProperty("paused", false);
      await expect
        .poll(() => {
          return video.evaluate((element: HTMLVideoElement) => {
            return element.currentTime;
          });
        })
        .toBeGreaterThan(position);
      expectedCalls += 1;
      await expect(video).toHaveAttribute(
        "data-keyboard-play-calls",
        String(expectedCalls),
      );
      const pause = page.getByRole("button", {
        name: `Pause${suffix}`,
        exact: true,
      });
      await expect(pause).toBeFocused();
      await page.keyboard.press(key);
      await expect(video).toHaveJSProperty("paused", true);
      await expect(video).toHaveAttribute(
        "data-keyboard-play-calls",
        String(expectedCalls),
      );
    }
  }
}

[
  { name: "mouse", hasTouch: false, viewport: { width: 1280, height: 900 } },
  { name: "touch", hasTouch: true, viewport: { width: 390, height: 844 } },
].forEach(({ name, hasTouch, viewport }) => {
  test.describe(name, () => {
    test.use({ hasTouch, viewport });

    test("the video surface toggles playback while controls stay independent", async ({
      page,
      catalog,
    }) => {
      await page.goto(
        `/api/evidence/session/viewer?to=/items/${catalog.videoId}`,
      );
      const video = page.locator("video");
      const player = page.getByRole("group", {
        name: "Video player",
        exact: true,
      });
      await expect(video).toBeVisible();
      const bounds = await player.boundingBox();
      const position = { x: bounds!.width * 0.2, y: bounds!.height * 0.2 };
      const activateSurface = async () => {
        if (hasTouch) {
          await player.tap({ position });
        } else {
          await player.click({ position });
        }
      };
      await expect(video).toHaveJSProperty("paused", true);
      await activateSurface();
      await expect(video).toHaveJSProperty("paused", false);
      await expect
        .poll(() => {
          return video.evaluate((element: HTMLVideoElement) => {
            return element.currentTime;
          });
        })
        .toBeGreaterThan(0.1);
      await activateSurface();
      await expect(video).toHaveJSProperty("paused", true);

      const surface = page.getByRole("button", {
        name: "Play video",
        exact: true,
      });
      await surface.focus();
      await page.keyboard.press("Space");
      await expect(video).toHaveJSProperty("paused", false);
      await expect(surface).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Pause video", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(video).toHaveJSProperty("paused", true);
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(video).toHaveJSProperty("paused", false);
      await page.getByRole("button", { name: "Mute", exact: true }).click();
      await expect(video).toHaveJSProperty("muted", true);
      await expect(video).toHaveJSProperty("paused", false);
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(video).toHaveJSProperty("paused", true);
      await _expectKeyboardPlayback({ page, video });
    });
  });
});
