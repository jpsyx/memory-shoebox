import { test, expect } from "./media.fixtures.ts";

test.use({ catalogSize: 20, responsivePhotos: true });

[1280, 390].forEach((width) => {
  test(`photo journey has one visible owner at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/api/media-evidence/session");
    const itemId = "10000000-0000-4000-8000-000000000017";
    const print = page.locator(`[data-item-id="${itemId}"]`);
    await expect(print).toBeVisible();
    await expect
      .poll(async () => {
        return print.locator("img").evaluate((image: HTMLImageElement) => {
          return image.naturalWidth;
        });
      })
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function () {
        if (this.closest('[data-photo-surface="viewer"]')) {
          await new Promise((done) => {
            return setTimeout(done, 300);
          });
        }
        return decode.call(this);
      };
      const frames: Array<{ visible: boolean; phase: string | undefined }> = [];
      Object.assign(window, { photoJourneyFrames: frames });
      const sample = () => {
        const viewer = document.querySelector<HTMLElement>(
          '[data-photo-surface="viewer"]',
        );
        const flight = document.querySelector<HTMLElement>(
          "[data-photo-flight]",
        );
        if (viewer !== null) {
          frames.push({
            visible: getComputedStyle(viewer).opacity !== "0",
            phase: flight?.dataset.photoFlightPhase,
          });
        }
        if (frames.length < 90) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });
    await print.click();
    await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return (window as unknown as { photoJourneyFrames: unknown[] })
            .photoJourneyFrames.length;
        });
      })
      .toBeGreaterThanOrEqual(90);
    const frames = await page.evaluate(() => {
      return (
        window as unknown as {
          photoJourneyFrames: Array<{ visible: boolean; phase?: string }>;
        }
      ).photoJourneyFrames;
    });
    const firstVisible = frames.findIndex((frame) => {
      return frame.visible;
    });
    expect(firstVisible).toBeGreaterThan(0);
    expect(
      frames.slice(firstVisible).every((frame) => {
        return frame.visible && frame.phase === undefined;
      }),
    ).toBe(true);
    expect(
      frames.some((frame) => {
        return frame.phase === "holding";
      }),
    ).toBe(true);
    expect(
      frames.some((frame) => {
        return frame.phase === "moving";
      }),
    ).toBe(true);
    await expect(page.locator("[data-photo-flight]")).toHaveCount(0);
  });
});
