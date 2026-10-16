import { expect, test } from "../../media.fixtures.ts";
import { installTimelineWindowInstrumentation } from "./installTimelineWindowInstrumentation.ts";
import {
  attachTimelineWindowEvidence,
  expectTimelineWindowBackRestoration,
  focusFirstTimelineTile,
  getTraversedItemCountFromInstrumentation,
  traverseTimelineWindow,
} from "./timelineWindowTestHelpers.ts";

[
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test.describe(`${viewport.width}px retained stream`, () => {
    test.use({ viewport });
    test("bounds a long stream while preserving its anchor and browser Back", async ({
      page,
      browserName,
    }) => {
      const cdp =
        browserName === "chromium"
          ? await page.context().newCDPSession(page)
          : undefined;
      const instrumentation = await installTimelineWindowInstrumentation(page);
      await page.goto("/api/media-evidence/session");
      await focusFirstTimelineTile(page);
      const memorySamples = await traverseTimelineWindow({
        page,
        cdp,
        instrumentation,
      });
      expect(getTraversedItemCountFromInstrumentation(instrumentation)).toBe(
        5000,
      );
      expect(
        await page.evaluate(() => {
          const node = (window as typeof window & { evictedFocusNode: Element })
            .evictedFocusNode;
          return node.isConnected && node === document.activeElement;
        }),
      ).toBe(true);
      expect(instrumentation.evictionDeltas.length).toBeGreaterThan(0);
      await attachTimelineWindowEvidence({
        testInfo: test.info(),
        instrumentation,
        memorySamples,
      });
      expect(Math.max(...instrumentation.evictionDeltas)).toBeLessThanOrEqual(
        2,
      );
      await expectTimelineWindowBackRestoration(page);
    });
  });
});
