import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";

type SeekAction = {
  name: string;
  atSeconds: number;
  run: () => Promise<void>;
};

async function _seedMoments(page: Page, videoId: string): Promise<void> {
  const comment = await page.request.post(`/api/items/${videoId}/comments`, {
    data: { body: "A moment worth revisiting", atSeconds: 2 },
  });
  expect(comment.ok()).toBe(true);
  const reactions = await Promise.all(
    [6, 8, 8.1].map((atSeconds) => {
      return page.request.put(
        `/api/items/${videoId}/video-reactions/${crypto.randomUUID()}`,
        {
          data: { emoji: "😮", atSeconds },
        },
      );
    }),
  );
  reactions.forEach((reaction) => {
    expect(reaction.ok()).toBe(true);
  });
}

async function _expectSeekState(
  video: Locator,
  atSeconds: number,
  isPaused: boolean,
): Promise<void> {
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.currentTime;
      });
    })
    .toBeGreaterThanOrEqual(atSeconds - 0.1);
  await expect(video).toHaveJSProperty("seeking", false);
  await expect(video).toHaveJSProperty("paused", isPaused);
  const position = await video.evaluate((element: HTMLVideoElement) => {
    return element.currentTime;
  });
  expect(position).toBeLessThan(atSeconds + 1);
  if (!isPaused) {
    await expect
      .poll(() => {
        return video.evaluate((element: HTMLVideoElement) => {
          return element.currentTime;
        });
      })
      .toBeGreaterThan(position + 0.1);
  }
}

function _makeSeekActionsFromPage(page: Page): SeekAction[] {
  const slider = page.getByRole("slider", { name: "Where in the video" });
  return [
    {
      name: "comment marker",
      atSeconds: 2,
      run: async () => {
        await page.getByRole("button", { name: /^Seek to 0:02:/ }).click();
      },
    },
    {
      name: "reaction marker",
      atSeconds: 6,
      run: async () => {
        await page.getByRole("button", { name: /^Seek to 0:06:/ }).click();
      },
    },
    {
      name: "popover timestamp",
      atSeconds: 2,
      run: async () => {
        await page.getByRole("button", { name: /^Seek to 0:02:/ }).click();
        await page
          .getByRole("list", { name: "Moments near 0:02" })
          .getByRole("button", { name: /^Seek to/ })
          .click();
      },
    },
    {
      name: "grouped moment",
      atSeconds: 8,
      run: async () => {
        await page.getByRole("button", { name: "2 moments near 0:08" }).click();
        await page
          .getByRole("list", { name: "Moments near 0:08" })
          .getByRole("button", { name: /^Seek to/ })
          .first()
          .click();
      },
    },
    {
      name: "comment timestamp",
      atSeconds: 2,
      run: async () => {
        await page
          .getByRole("article")
          .filter({ hasText: "A moment worth revisiting" })
          .getByRole("button", { name: /^0:02 / })
          .click();
      },
    },
    {
      name: "scrubber click",
      atSeconds: 5,
      run: async () => {
        const bounds = await slider.boundingBox();
        await slider.click({
          position: { x: bounds!.width / 2, y: bounds!.height / 2 },
        });
      },
    },
    {
      name: "keyboard scrubber",
      atSeconds: 1,
      run: async () => {
        await slider.press("ArrowRight");
      },
    },
  ];
}

[true, false].forEach((isPaused) => {
  test(`seeking preserves ${isPaused ? "paused" : "playing"} playback across video controls`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      `/api/evidence/session/viewer?to=/items/${catalog.videoId}`,
    );
    await _seedMoments(page, catalog.videoId);
    await page.reload();
    const video = page.locator("video");
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await expect
      .poll(() => {
        return video.evaluate((element: HTMLVideoElement) => {
          return element.readyState;
        });
      })
      .toBeGreaterThanOrEqual(2);
    for (const action of _makeSeekActionsFromPage(page)) {
      await test.step(action.name, async () => {
        await video.evaluate(async (element: HTMLVideoElement, shouldPause) => {
          element.pause();
          element.currentTime = 0;
          if (!shouldPause) {
            await element.play();
          }
        }, isPaused);
        await expect(video).toHaveJSProperty("paused", isPaused);
        await expect(
          page.getByRole("slider", { name: "Where in the video" }),
        ).toHaveAttribute("aria-valuenow", /^(0|0\.\d+)$/);
        await action.run();
        await _expectSeekState(video, action.atSeconds, isPaused);
        if (await page.getByRole("dialog").count()) {
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toBeHidden();
        }
      });
    }
  });
});
