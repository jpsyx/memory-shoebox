import { writeFile } from "node:fs/promises";
import type { CDPSession, Page, TestInfo } from "@playwright/test";
import { expect } from "../../media.fixtures.ts";
import type { TimelineWindowInstrumentation } from "./installTimelineWindowInstrumentation.ts";

/**
 * Browser counters captured after the next thousand-item traversal boundary.
 */
type CaptureMemorySampleOptions = {
  page: Page;
  cdp: CDPSession;
  traversed: number;
  maxTiles: number;
  retainedPageCount: number;
};

async function _scrollForward({
  page,
  instrumentation,
}: Readonly<{
  page: Page;
  instrumentation: TimelineWindowInstrumentation;
}>): Promise<void> {
  await page.evaluate(() => {
    if (
      (window as typeof window & { timelinePublishing: boolean })
        .timelinePublishing
    ) {
      return;
    }
    (window as typeof window & { scrollIntent: number }).scrollIntent =
      ((window as typeof window & { scrollIntent: number }).scrollIntent ?? 0) +
      1;
    window.scrollBy(0, innerHeight * 1.5);
    return new Promise<void>((done) => {
      return requestAnimationFrame(() => {
        return requestAnimationFrame(() => {
          return done();
        });
      });
    });
  });
  await expect
    .poll(() => {
      return instrumentation.inFlight;
    })
    .toBe(0);
}

async function _getPagesFromInstrumentation({
  page,
  instrumentation,
}: Readonly<{
  page: Page;
  instrumentation: TimelineWindowInstrumentation;
}>): Promise<Set<number | undefined>> {
  const retainedDays = await page
    .locator('[id^="day-"]')
    .evaluateAll((nodes) => {
      return nodes.map((node) => {
        return node.id.slice(4);
      });
    });
  return new Set(
    retainedDays
      .filter((day) => {
        return !(instrumentation.requests > 5 && day === "2026-10-13");
      })
      .map((day) => {
        return instrumentation.pageByDay.get(day);
      }),
  );
}

async function _captureMemorySample({
  page,
  cdp,
  traversed,
  maxTiles,
  retainedPageCount,
}: Readonly<CaptureMemorySampleOptions>): Promise<unknown> {
  await page.waitForLoadState("networkidle");
  await cdp.send("HeapProfiler.collectGarbage");
  return {
    traversed,
    tiles: maxTiles,
    pages: retainedPageCount,
    ...(await cdp.send("Runtime.getHeapUsage")),
    ...(await cdp.send("Memory.getDOMCounters")),
  };
}

function _getClickableAnchorFromPage(
  page: Page,
): Promise<{ id: string; top: number }> {
  return page.locator("[data-item-id]").evaluateAll((nodes) => {
    const node = nodes.find((value) => {
      const rect = value.getBoundingClientRect();
      return (
        rect.top >= 80 &&
        rect.bottom < innerHeight &&
        value.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        )
      );
    })!;
    return {
      id: node.getAttribute("data-item-id")!,
      top: node.getBoundingClientRect().top,
    };
  });
}

async function _focusTimelineAnchor({
  page,
  anchor,
}: Readonly<{
  page: Page;
  anchor: Readonly<{ id: string; top: number }>;
}>): Promise<void> {
  await page.locator(`[data-item-id="${anchor.id}"]`).focus();
  await page.evaluate(async () => {
    for (let frame = 0; frame < 8; frame++) {
      await new Promise<void>((done) => {
        return requestAnimationFrame(() => {
          return done();
        });
      });
    }
  });
  await expect
    .poll(async () => {
      return Math.abs(
        (await page
          .locator(`[data-item-id="${anchor.id}"]`)
          .evaluate((node) => {
            return node.getBoundingClientRect().top;
          })) - anchor.top,
      );
    })
    .toBeLessThanOrEqual(2);
}

/** Counts distinct day metadata observed across the retained paging window. */
export function getTraversedItemCountFromInstrumentation(
  instrumentation: Readonly<TimelineWindowInstrumentation>,
): number {
  return [...instrumentation.days.values()].reduce((total, itemCount) => {
    return total + itemCount;
  }, 0);
}

/** Gives the first tile focus before it is evicted from the mounted window. */
export async function focusFirstTimelineTile(
  page: Readonly<Page>,
): Promise<void> {
  await expect(page.locator("[data-item-id]").first()).toBeVisible();
  await page
    .locator("[data-item-id]")
    .first()
    .evaluate((node) => {
      (node as HTMLElement).focus({ preventScroll: true });
      (
        window as typeof window & { evictedFocusNode: Element }
      ).evictedFocusNode = node;
    });
}

/**
 * Traverses the stream while asserting bounded mounted tiles and retained
 * pages.
 */
export async function traverseTimelineWindow({
  page,
  cdp,
  instrumentation,
}: Readonly<{
  page: Page;
  cdp: CDPSession | undefined;
  instrumentation: TimelineWindowInstrumentation;
}>): Promise<unknown[]> {
  const memorySamples: unknown[] = [];
  let memoryBoundary = 0;
  let maxTiles = 0;
  // Each step observes the prior publication before deciding whether to
  // continue.
  for (
    let step = 0;
    step < 700 &&
    getTraversedItemCountFromInstrumentation(instrumentation) < 5000;
    step += 1
  ) {
    await _scrollForward({ page, instrumentation });
    maxTiles = Math.max(
      maxTiles,
      await page.locator('[data-photo-surface="pile"]').count(),
    );
    expect(maxTiles).toBeLessThanOrEqual(200);
    const pages = await _getPagesFromInstrumentation({ page, instrumentation });
    expect(pages.size).toBeLessThanOrEqual(5);
    const traversed = getTraversedItemCountFromInstrumentation(instrumentation);
    if (cdp && traversed >= memoryBoundary + 1000) {
      memoryBoundary = traversed;
      memorySamples.push(
        await _captureMemorySample({
          page,
          cdp,
          traversed,
          maxTiles,
          retainedPageCount: pages.size,
        }),
      );
    }
  }
  return memorySamples;
}

/** Attaches offset and browser-memory evidence to the test result. */
export async function attachTimelineWindowEvidence({
  testInfo,
  instrumentation,
  memorySamples,
}: Readonly<{
  testInfo: TestInfo;
  instrumentation: TimelineWindowInstrumentation;
  memorySamples: readonly unknown[];
}>): Promise<void> {
  for (const [name, evidence] of [
    ["eviction-offsets", instrumentation.diagnostics],
    ["resident-memory", memorySamples],
  ] as const) {
    const path = testInfo.outputPath(`${name}.json`);
    await writeFile(path, JSON.stringify(evidence, null, 2));
    await testInfo.attach(name, { path, contentType: "application/json" });
  }
}

/**
 * Verifies item navigation and browser Back preserve the visible tile's offset.
 */
export async function expectTimelineWindowBackRestoration(
  page: Readonly<Page>,
): Promise<void> {
  const anchor = await _getClickableAnchorFromPage(page);
  await _focusTimelineAnchor({ page, anchor });
  const box = await page.locator(`[data-item-id="${anchor.id}"]`).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page).toHaveURL(new RegExp(`/items/${anchor.id}`));
  await expect(page.locator('[data-photo-surface="viewer"]')).toBeVisible();
  await page.mouse.move(0, 0);
  await page.goBack();
  await expect
    .poll(async () => {
      const top = await page
        .locator(`[data-item-id="${anchor.id}"]`)
        .evaluateAll((nodes) => {
          return nodes[0]?.getBoundingClientRect().top;
        });
      return top === undefined ? Infinity : Math.abs(top - anchor.top);
    })
    .toBeLessThanOrEqual(2);
}
