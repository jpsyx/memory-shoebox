import type { Locator, Page } from "@playwright/test";
import { expect } from "../admin.fixtures.ts";

/** Forces the real controller's supported window fallback, without replacing UI. */
export async function useWindowTheater(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function () {
      return Promise.reject(
        new DOMException("Test refusal", "NotAllowedError"),
      );
    };
  });
}

/** Opens the existing composer with keyboard activation while CSS is animated. */
export async function openTheaterComments(page: Page): Promise<Locator> {
  const trigger = page.getByRole("button", { name: /^Open comments,/ });
  await trigger.focus();
  await trigger.press("ArrowUp");
  const field = page.getByRole("textbox", { name: "Write a comment" });
  await expect(field).toBeFocused();
  return field;
}

/** Requires actual geometry and hit testing, catching offscreen or covered controls. */
export async function expectReachable(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await expect
    .poll(async () => {
      return target.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          fits:
            bounds.width > 0 &&
            bounds.height > 0 &&
            bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.right <= innerWidth + 1 &&
            bounds.bottom <= innerHeight + 1,
          receivesPointer:
            element.contains(
              document.elementFromPoint(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
              ),
            ) ||
            document
              .elementFromPoint(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
              )
              ?.closest("button")
              ?.getAttribute("aria-label") ||
            false,
        };
      });
    })
    .toEqual({ fits: true, receivesPointer: true });
}

/** Checks portal ancestry against the actual application-owned fullscreen host. */
export async function expectInsideTheater(target: Locator): Promise<void> {
  await expectReachable(target);
  expect(
    await target.evaluate((element) => {
      const host = element.closest("[data-item-theater-host]");
      return (
        host !== null &&
        (!document.fullscreenElement || document.fullscreenElement === host)
      );
    }),
  ).toBe(true);
}

/** Waits for native media readiness, then pauses at a deterministic annotation. */
export async function pauseTheaterVideo(
  page: Page,
  seconds: number,
): Promise<void> {
  const video = page.locator("video");
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
  }, seconds);
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.currentTime;
      });
    })
    .toBeCloseTo(seconds, 1);
}

/** Navigates using the one shared controller, allowing CSS-hidden desktop arrows. */
export async function moveTheater(
  page: Page,
  direction: "Next" | "Previous",
): Promise<void> {
  const arrow = page.getByRole("button", {
    name: `${direction} photo or video`,
  });
  await arrow.focus();
  await arrow.press("Enter");
}

/** Awaits finite dock transitions so captures record settled geometry. */
export async function waitForTheaterMorph(page: Page): Promise<void> {
  await page
    .locator("[data-theater-comment-dock]")
    .evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => {
            return (
              animation.playState === "running" &&
              animation.effect?.getTiming().iterations !== Infinity
            );
          })
          .map((animation) => {
            return animation.finished.catch(() => {});
          }),
      );
    });
}
