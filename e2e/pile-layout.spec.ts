import { expect, test } from "@playwright/test";
import {
  makeDay,
  makeItem,
  makeMediaSource,
} from "../apps/web/src/surfaces/Timeline/timelineFixtures.ts";
import { createMeResponse } from "../apps/web/src/testing/createMeResponse.ts";

/** Mixed proportions expose columns that fill downward before moving across. */
const ITEMS = Array.from({ length: 8 }, (_, index) => {
  const width = index % 2 === 0 ? 400 : 300;
  const height = index % 2 === 0 ? 300 : 400;
  const item = makeItem({
    itemId: `018f0000-0000-7000-8000-00000000a00${index}`,
  });
  const source = makeMediaSource({
    width,
    height,
    url: `https://media.example.test/${width}x${height}.svg`,
  });
  return {
    ...item,
    media: { ...item.media, thumb: source, display: source },
  };
});

test.beforeEach(async ({ page }) => {
  await page.route("https://media.example.test/*.svg", async (route) => {
    const [width, height] = new URL(route.request().url()).pathname
      .slice(1, -4)
      .split("x");
    await route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#bd976f"/></svg>`,
    });
  });
  const days = [
    makeDay({ itemCount: 2, items: ITEMS.slice(0, 2) }),
    makeDay({ capturedOn: "2026-09-26", itemCount: 8, items: ITEMS }),
  ];
  const answers: Record<string, unknown> = {
    "/api/setup": { isRequired: false },
    "/api/setup/progress": { needsInvitations: false },
    "/api/me": createMeResponse(),
    "/api/timeline": { days, nextCursor: null, resultCount: null },
    "/api/timeline/rail": {
      days: days.map(({ capturedOn, itemCount }) => {
        return {
          capturedOn,
          itemCount,
        };
      }),
      nextCursor: null,
    },
    "/api/public-settings": {
      shoeboxName: "My Shoebox",
      baseUrl: "http://localhost:8099",
    },
  };
  await page.route(
    (url) => {
      return url.pathname.startsWith("/api/");
    },
    async (route) => {
      const answer = answers[new URL(route.request().url()).pathname];
      await route.fulfill(
        answer === undefined ? { status: 204 } : { json: answer },
      );
    },
  );
});

[1280, 768, 400].forEach((width) => {
  ["tidy", "messy"].forEach((arrangement) => {
    test(`fills rows before wrapping at ${width}px, ${arrangement}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const sparsePrints = page
        .locator("section")
        .filter({ has: page.locator("#day-2026-09-27") })
        .locator("[data-item-id]");
      await expect(sparsePrints).toHaveCount(2);
      await page.evaluate((value) => {
        document.documentElement.dataset.pile = value;
      }, arrangement);
      // Layout coordinates ignore the deliberate messy-mode rotation.
      const sparseBoxes = await sparsePrints.evaluateAll((prints) => {
        return prints.map((print) => {
          return {
            left: (print as HTMLElement).offsetLeft,
            top: (print as HTMLElement).offsetTop,
          };
        });
      });
      expect(sparseBoxes[1]?.top).toBe(sparseBoxes[0]?.top);
      expect(sparseBoxes[1]?.left).toBeGreaterThan(sparseBoxes[0]?.left ?? 0);

      const densePrints = page
        .locator("section")
        .filter({ has: page.locator("#day-2026-09-26") })
        .locator("[data-item-id]");
      await densePrints.first().scrollIntoViewIfNeeded();
      const denseBoxes = await densePrints.evaluateAll((prints) => {
        return prints.map((print) => {
          return {
            left: (print as HTMLElement).offsetLeft,
            top: (print as HTMLElement).offsetTop,
          };
        });
      });
      expect(denseBoxes[1]?.top).toBe(denseBoxes[0]?.top);
      const wrappedPrint = denseBoxes.find((box) => {
        return box.top > (denseBoxes[0]?.top ?? 0);
      });
      expect(wrappedPrint).toBeDefined();
      expect(wrappedPrint?.left).toBe(denseBoxes[0]?.left);
      expect(
        await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        }),
      ).toBe(false);
    });
  });
});
