import { test, expect } from "./admin.fixtures.ts";

test("video keyboard seeking moves decoded media and its accessible clock together", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/viewer?to=/items/${catalog.videoId}`);
  const video = page.locator("video");
  const slider = page.getByRole("slider", { name: "Where in the video" });
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.readyState;
      });
    })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.seekable.length ? element.seekable.end(0) : 0;
      });
    })
    .toBeGreaterThan(1);
  const duration = await video.evaluate((element: HTMLVideoElement) => {
    return element.duration;
  });
  await expect(slider).toHaveAttribute("aria-valuemax", String(duration));
  for (let count = 0; count < 30; count++) {
    if (
      await slider.evaluate((element) => {
        return element === document.activeElement;
      })
    )
      break;
    await page.keyboard.press("Tab");
  }
  await expect(slider).toBeFocused();
  for (const [key, position] of [
    ["ArrowRight", 1],
    ["ArrowRight", 2],
    ["End", 10],
    ["Home", 0],
  ] as const) {
    await page.keyboard.press(key);
    await expect
      .poll(() => {
        return video.evaluate((element: HTMLVideoElement) => {
          return element.currentTime;
        });
      })
      .toBeCloseTo(position, 1);
    await expect(slider).toHaveAttribute("aria-valuenow", String(position));
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      `0:${String(position).padStart(2, "0")} of 0:10`,
    );
    await expect(slider).toBeFocused();
  }
});
