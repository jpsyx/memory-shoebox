import { writeFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import {
  makeDay,
  makeItem,
  makeMediaSource,
} from "../apps/web/src/surfaces/Timeline/timelineFixtureHelpers.ts";
import { createMeResponse } from "../apps/web/src/testing/createMeResponse.ts";

type DayPrintCoordinates = {
  itemId: string | undefined;
  row: string | undefined;
  day: string;
  localTop: number;
  rowTop: number;
  left: number;
  top: number;
};

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
    "/api/bootstrap": {
      setup: { isRequired: false },
      account: createMeResponse(),
      progress: { needsInvitations: false },
    },
    "/api/setup": { isRequired: false },
    "/api/setup/progress": { needsInvitations: false },
    "/api/me": createMeResponse(),
    "/api/timeline": {
      previousCursor: null,
      days,
      nextCursor: null,
      resultCount: null,
    },
    "/api/timeline/rail": {
      days: days.map(({ capturedOn, itemCount }) => {
        return {
          capturedOn,
          itemCount,
          photoCount: itemCount,
          videoCount: 0,
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

/**
 * Native layout offsets share a verified day origin and ignore print rotations.
 */
async function _getDayCoordinatesFromPrints({
  prints,
  dayId,
}: {
  prints: Locator;
  dayId: string;
}): Promise<DayPrintCoordinates[]> {
  return prints.evaluateAll((elements, expectedDay) => {
    const day = document.getElementById(expectedDay);
    if (!(day instanceof HTMLElement)) {
      throw new Error("Missing owning day");
    }
    const offsetFromDocument = (element: HTMLElement) => {
      let left = 0;
      let top = 0;
      let ancestor: HTMLElement | undefined = element;
      while (ancestor) {
        left += ancestor.offsetLeft;
        top += ancestor.offsetTop;
        if (
          ancestor.offsetParent !== null &&
          !(ancestor.offsetParent instanceof HTMLElement)
        ) {
          throw new Error("Unsupported layout origin");
        }
        ancestor = ancestor.offsetParent ?? undefined;
      }
      return { left, top };
    };
    const origin = offsetFromDocument(day);
    return elements.map((element) => {
      if (
        !(element instanceof HTMLElement) ||
        element.closest("section") !== day
      ) {
        throw new Error("Print belongs to another day");
      }
      const row = element.closest<HTMLElement>("[data-timeline-row]");
      if (!row || !day.contains(row)) {
        throw new Error("Missing owned row");
      }
      const position = offsetFromDocument(element);
      return {
        itemId: element.dataset.itemId,
        row: row.dataset.timelineRow,
        day: day.id,
        localTop: element.offsetTop,
        rowTop: row.offsetTop,
        left: position.left - origin.left,
        top: position.top - origin.top,
      };
    });
  }, dayId);
}

[1280, 768, 400].forEach((width) => {
  ["tidy", "messy"].forEach((arrangement) => {
    test(`fills rows before wrapping at ${width}px, ${arrangement}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const sparsePrints = page
        .locator("section#day-2026-09-27")
        .locator("[data-item-id]");
      await expect(sparsePrints).toHaveCount(2);
      await page.evaluate((value) => {
        document.documentElement.dataset.pile = value;
      }, arrangement);
      // Layout coordinates ignore the deliberate messy-mode rotation.
      const sparseBoxes = await _getDayCoordinatesFromPrints({
        prints: sparsePrints,
        dayId: "day-2026-09-27",
      });
      expect(sparseBoxes[1]?.top).toBe(sparseBoxes[0]?.top);
      expect(sparseBoxes[1]?.left).toBeGreaterThan(sparseBoxes[0]?.left ?? 0);

      const densePrints = page
        .locator("section#day-2026-09-26")
        .locator("[data-item-id]");
      await densePrints.first().scrollIntoViewIfNeeded();
      await expect(densePrints).toHaveCount(8);
      const denseBoxes = await _getDayCoordinatesFromPrints({
        prints: densePrints,
        dayId: "day-2026-09-26",
      });
      expect(
        denseBoxes.map((box) => {
          return box.itemId;
        }),
      ).toEqual(
        ITEMS.map((item) => {
          return item.itemId;
        }),
      );
      await writeFile(
        test.info().outputPath("layout-coordinates.json"),
        JSON.stringify(
          { width, arrangement, sparseBoxes, denseBoxes },
          null,
          2,
        ),
      );
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
