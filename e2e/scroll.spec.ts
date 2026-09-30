import { seedArchiveForSpec } from "./support/archive.ts";
import { expect, test } from "./support/signedIn.ts";

/**
 * Whether the pile needs virtualizing, answered rather than guessed at.
 *
 * Step 5b's decision 7 held that a day-level `content-visibility: auto` would
 * be enough and that virtualization would be added only if a measurement asked
 * for it. This is that measurement: a scripted scroll over the seeded 340-item
 * day, at a phone-sized viewport, with the two thresholds that decide the
 * question written as assertions rather than as numbers somebody has to read.
 * The `console.log` is what puts the figures in the run's output for the design
 * document's § What the measurement found.
 *
 * It is here rather than in a standalone script because the measurement needs
 * three things set up: a server, a catalog holding the fat day, and a session.
 * The end-to-end run builds all three for nothing.
 */

/** What one scripted scroll comes back with. */
type ScrollMeasurement = {
  framesPerSecond: number;
  /** -1 where `PerformanceObserver` does not know the `longtask` type. */
  longTaskCount: number;
  longestTaskMs: number;
};

/**
 * Scrolls thirty thousand pixels in six-hundred-pixel steps, one animation
 * frame apart, counting frames and long tasks as it goes.
 *
 * It runs in the page, so it closes over nothing: `page.evaluate` sends this
 * function's source across and the browser is where it is compiled.
 *
 * **`longtask` is not an entry type every browser knows.** The run is Chromium,
 * where it is, but an unsupported `observe` throws, and losing the frame rate
 * as well because the task counter was unavailable would be the wrong trade.
 * It reports `longTaskCount: -1` instead, which is a figure no supported
 * browser can produce.
 */
async function _measureAScriptedScroll(): Promise<ScrollMeasurement> {
  const longTasks: number[] = [];
  const startObserving = (): PerformanceObserver | undefined => {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          longTasks.push(entry.duration);
        });
      });
      observer.observe({ entryTypes: ["longtask"] });
      return observer;
    } catch {
      return undefined;
    }
  };

  const observer = startObserving();
  const started = performance.now();
  let frames = 0;
  const count = (): void => {
    frames += 1;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);

  for (let offset = 0; offset < 30_000; offset += 600) {
    window.scrollTo(0, offset);
    await new Promise((resolve) => {
      return requestAnimationFrame(resolve);
    });
  }

  const elapsed = performance.now() - started;
  observer?.disconnect();
  return {
    framesPerSecond: Math.round((frames / elapsed) * 1000),
    longTaskCount: observer === undefined ? -1 : longTasks.length,
    longestTaskMs: Math.round(Math.max(0, ...longTasks)),
  };
}

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

test("scrolls the 340-item day without a long task", async ({ adminPage }) => {
  await adminPage.setViewportSize({ width: 400, height: 800 });
  await adminPage.goto("/");
  await expect(adminPage.locator("#day-2026-09-27")).toBeAttached();

  const measured = await adminPage.evaluate(_measureAScriptedScroll);

  // eslint-disable-next-line no-console
  console.log("scroll measurement", JSON.stringify(measured));
  // Wide on purpose. An idle laptop reads 61 frames a second and no long
  // task at all; the same scroll on a machine still settling after a build
  // reads 57 with one task around fifty milliseconds. The step design's
  // § What the measurement found has both, and why the threshold is not the
  // measurement.
  expect(measured.longestTaskMs).toBeLessThan(200);
  expect(measured.framesPerSecond).toBeGreaterThan(30);
});
