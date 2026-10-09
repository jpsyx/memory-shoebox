import { test, expect } from "./admin.fixtures.ts";

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
    });
  });
});
