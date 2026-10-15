import { expect, type Page } from "@playwright/test";

type MediaObservations = {
  longTasksMs: number[];
  maxMediaNodes: number;
  hasLongTaskObserver: boolean;
};
/** Timings and resident media nodes observed during actual neighboring moves. */
export type MediaNavigationMeasurements = {
  firstImageMs: number;
  navigationMs: readonly number[];
  videoStartupMs: number;
  longTasksMs: readonly number[];
  maxMediaNodes: number;
};

async function _observeMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const observations = {
      longTasksMs: [] as number[],
      maxMediaNodes: 0,
      hasLongTaskObserver:
        PerformanceObserver.supportedEntryTypes.includes("longtask"),
    };
    (
      window as unknown as { mediaObservations: MediaObservations }
    ).mediaObservations = observations;
    const countMedia = (): void => {
      observations.maxMediaNodes = Math.max(
        observations.maxMediaNodes,
        document.querySelectorAll("img,video,canvas").length,
      );
    };
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        new MutationObserver(countMedia).observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        countMedia();
      },
      { once: true },
    );
    if (observations.hasLongTaskObserver) {
      new PerformanceObserver((entries) => {
        observations.longTasksMs.push(
          ...entries.getEntries().map((entry) => {
            return entry.duration;
          }),
        );
      }).observe({ type: "longtask", buffered: true });
    }
  });
}

/** Wait for the actual current display to decode rather than a thumbnail. */
export async function expectCurrentPhotoDecoded(page: Page): Promise<void> {
  const itemId = new URL(page.url()).pathname.split("/").at(-1)!;
  const frame = page.locator(
    `[data-photo-surface="viewer"][data-photo-item="${itemId}"]`,
  );
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("data-photo-ready", "true");
  const image = frame.locator("picture img, :scope > img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => {
      return image.evaluate((element: HTMLImageElement) => {
        const candidate = element
          .closest("picture")
          ?.querySelector("source")
          ?.getAttribute("srcset")
          ?.split(" ")[0];
        return (
          element.complete &&
          element.naturalWidth > 0 &&
          element.currentSrc === element.src &&
          element.currentSrc === candidate
        );
      });
    })
    .toBe(true);
  await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
  });
}

async function _moveToNeighbor(options: {
  page: Page;
  direction: "Next" | "Previous";
  isVideo?: boolean;
}): Promise<number> {
  const { page, direction, isVideo = false } = options;
  const button = page.getByRole("button", {
    name: `${direction} photo or video`,
    exact: true,
  });
  await expect(button).not.toHaveAttribute("aria-disabled", "true");
  const previousUrl = page.url();
  const started = performance.now();
  await button.click();
  await expect(page).not.toHaveURL(previousUrl);
  if (isVideo) {
    await expect(page.locator("video")).toBeVisible();
  } else {
    await expectCurrentPhotoDecoded(page);
  }
  return performance.now() - started;
}

async function _measureRepeatedMoves(page: Page): Promise<number[]> {
  return Array.from({ length: 30 }).reduce<Promise<number[]>>(
    async (prior, _, position) => {
      const times = await prior;
      times.push(
        await _moveToNeighbor({
          page,
          direction: position % 2 === 0 ? "Next" : "Previous",
        }),
      );
      return times;
    },
    Promise.resolve([] as number[]),
  );
}

async function _measureVideoStartup(page: Page): Promise<number> {
  await Array.from({ length: 31 }).reduce(async (prior, _, position) => {
    await prior;
    await _moveToNeighbor({
      page,
      direction: "Next",
      isVideo: position === 30,
    });
  }, Promise.resolve());
  const videoStarted = performance.now();
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await expect
    .poll(() => {
      return page.locator("video").evaluate((video: HTMLVideoElement) => {
        return video.readyState >= 2 && video.currentTime > 0 && !video.paused;
      });
    })
    .toBe(true);
  const videoStartupMs = performance.now() - videoStarted;
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.pause();
  });
  return videoStartupMs;
}

/** Measure cold display, 30 repeat moves, both burst boundaries and playback. */
export async function measureMediaNavigation(
  page: Page,
): Promise<MediaNavigationMeasurements> {
  await _observeMedia(page);
  const started = performance.now();
  await page.goto("/items/10000000-0000-4000-8000-000000000000");
  await expectCurrentPhotoDecoded(page);
  const firstImageMs = performance.now() - started;
  const navigationMs = await _measureRepeatedMoves(page);
  const videoStartupMs = await _measureVideoStartup(page);
  const observations = await page.evaluate(() => {
    return (window as unknown as { mediaObservations: MediaObservations })
      .mediaObservations;
  });
  return {
    firstImageMs,
    navigationMs,
    videoStartupMs,
    longTasksMs: observations.longTasksMs,
    maxMediaNodes: observations.maxMediaNodes,
  };
}
