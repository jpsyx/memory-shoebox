import type { Locator } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";

async function _getClippedEdgesFromPrint(print: Locator): Promise<string[]> {
  return print.evaluate((element: HTMLButtonElement) => {
    const rectangle = element.getBoundingClientRect();
    const transform = new DOMMatrix(getComputedStyle(element).transform);
    const halfWidth = element.offsetWidth / 2;
    const halfHeight = element.offsetHeight / 2;
    return [
      { edge: "left", x: 2 - halfWidth, y: 0 },
      { edge: "top", x: 0, y: 2 - halfHeight },
      { edge: "right", x: halfWidth - 2, y: 0 },
      { edge: "bottom", x: 0, y: halfHeight - 2 },
      { edge: "top left", x: 2 - halfWidth, y: 2 - halfHeight },
      { edge: "top right", x: halfWidth - 2, y: 2 - halfHeight },
      { edge: "bottom left", x: 2 - halfWidth, y: halfHeight - 2 },
      { edge: "bottom right", x: halfWidth - 2, y: halfHeight - 2 },
    ].flatMap(({ edge, x, y }) => {
      const screenX =
        rectangle.x + rectangle.width / 2 + transform.a * x + transform.c * y;
      const screenY =
        rectangle.y + rectangle.height / 2 + transform.b * x + transform.d * y;
      return element.contains(document.elementFromPoint(screenX, screenY))
        ? []
        : [edge];
    });
  });
}

[1440, 768, 390].forEach((width) => {
  (["messy", "tidy"] as const).forEach((arrangement) => {
    test(`${arrangement} timeline thumbnail edges remain visible and clickable at ${width}px`, async ({
      page,
      catalog,
    }) => {
      await catalog.database
        .updateTable("items")
        .set({
          captured_on: "2026-09-28",
          captured_at: "2026-09-28T12:00:00.000Z",
        })
        .where("id", "=", "00000000-0000-4000-8000-000000000011")
        .execute();
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/api/evidence/session/admin?to=/");
      await page.evaluate((value) => {
        document.documentElement.dataset.pile = value;
      }, arrangement);
      const print = page.locator(
        'button[data-item-id="00000000-0000-4000-8000-000000000011"]',
      );
      await expect(print).toBeVisible();
      await print.locator("img").evaluate(async (image: HTMLImageElement) => {
        await image.decode();
      });
      await expect
        .poll(() => {
          return _getClippedEdgesFromPrint(print);
        })
        .toEqual([]);
      await print.hover();
      await print.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((motion) => {
            return motion.finished;
          }),
        );
      });
      await expect
        .poll(() => {
          return _getClippedEdgesFromPrint(print);
        })
        .toEqual([]);
      expect(
        await page.evaluate(() => {
          return document.documentElement.scrollWidth;
        }),
      ).toBe(width);
    });
  });
});
