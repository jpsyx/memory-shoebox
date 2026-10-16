import { writeFile } from "node:fs/promises";
import type { Page, Request } from "@playwright/test";
import { test, expect } from "./media.fixtures.ts";

type TimelineReadiness = {
  visibleImages: number;
  readyImages: number;
  intersectionQuietMs: number;
  activeAnimations: number;
  documentAnimations: number;
  observedTargets: number;
  tiles: number;
  days: string[];
  y: number;
};

async function _observeActivity(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const activity = { lastIntersection: 0, animations: 0, targets: 0 };
    Object.assign(window, { timelineActivity: activity });
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      targets = new Set<Element>();
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super((entries, observer) => {
          activity.lastIntersection = performance.now();
          callback(entries, observer);
        }, options);
      }
      override observe(target: Element): void {
        if (!this.targets.has(target)) {
          activity.targets += 1;
        }
        this.targets.add(target);
        super.observe(target);
      }
      override unobserve(target: Element): void {
        if (this.targets.delete(target)) {
          activity.targets -= 1;
        }
        super.unobserve(target);
      }
      override disconnect(): void {
        activity.targets -= this.targets.size;
        this.targets.clear();
        super.disconnect();
      }
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      activity.animations += 1;
      void animation.finished.then(
        () => {
          activity.animations -= 1;
        },
        () => {
          activity.animations -= 1;
        },
      );
      return animation;
    };
  });
}

async function _readReadiness(page: Page): Promise<TimelineReadiness> {
  return page.evaluate(() => {
    const activity = (
      window as typeof window & {
        timelineActivity: {
          lastIntersection: number;
          animations: number;
          targets: number;
        };
      }
    ).timelineActivity;
    const visible = [
      ...document.querySelectorAll<HTMLImageElement>(
        '[data-photo-surface="pile"] img',
      ),
    ].filter((image) => {
      const rect = image.getBoundingClientRect();
      return (
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        rect.right > 0 &&
        rect.left < innerWidth
      );
    });
    return {
      visibleImages: visible.length,
      readyImages: visible.filter((image) => {
        return (
          Boolean(image.getAttribute("src")) &&
          image.complete &&
          image.naturalWidth > 0
        );
      }).length,
      intersectionQuietMs: performance.now() - activity.lastIntersection,
      activeAnimations: activity.animations,
      documentAnimations: document.getAnimations().filter((animation) => {
        return animation.playState === "running" || animation.pending;
      }).length,
      observedTargets: activity.targets,
      tiles: document.querySelectorAll('[data-photo-surface="pile"]').length,
      days: [...document.querySelectorAll('[id^="day-"]')].map((node) => {
        return node.id.slice(4);
      }),
      y: scrollY,
    };
  });
}

type HeapUsage = {
  usedSize: number;
  totalSize: number;
  embedderHeapUsedSize: number;
  backingStorageSize: number;
};
type MemorySample = Awaited<ReturnType<typeof _readReadiness>> & {
  responses: number;
  sampleAnchor: { day: string; expectedTop: number; actualTop: number };
  pages: Array<number | undefined>;
  pendingRequests: number;
  seenStarted: number;
  seenFinished: number;
  heap: HeapUsage | "unavailable";
  dom:
    | {
        documents: number;
        nodes: number;
        jsEventListeners: number;
      }
    | "unavailable";
};

function _assertSampledConvergence(samples: MemorySample[]): void {
  expect(
    samples.map((sample) => {
      return sample.responses;
    }),
  ).toEqual(
    Array.from({ length: 17 }, (_, index) => {
      return index + 6;
    }),
  );
  const stable = samples.slice(-8);
  expect(stable).toHaveLength(8);
  expect(
    new Set(
      stable.map((sample) => {
        return sample.sampleAnchor.expectedTop;
      }),
    ).size,
  ).toBe(1);
  expect(
    stable.map((sample) => {
      return sample.responses;
    }),
  ).toEqual([15, 16, 17, 18, 19, 20, 21, 22]);
  expect(
    new Set(
      stable.map((sample) => {
        return sample.tiles;
      }),
    ).size,
  ).toBe(1);
  expect(
    new Set(
      stable.map((sample) => {
        return sample.observedTargets;
      }),
    ).size,
  ).toBe(1);
  const heaps = stable.flatMap((sample) => {
    return sample.heap === "unavailable" ? [] : [sample.heap.usedSize];
  });
  if (heaps.length === 0) {
    return;
  }
  const mean =
    heaps.reduce((sum, size) => {
      return sum + size;
    }, 0) / heaps.length;
  const slope =
    heaps.reduce((sum, size, index) => {
      return sum + (index - 3.5) * (size - mean);
    }, 0) / 42;
  expect(Math.max(...heaps) / Math.min(...heaps)).toBeLessThanOrEqual(1.1);
  expect(slope / mean).toBeLessThanOrEqual(0.01);
  const counters = stable.flatMap((sample) => {
    return sample.dom === "unavailable" ? [] : [sample.dom];
  });
  expect(
    new Set(
      counters.map((counter) => {
        return counter.documents;
      }),
    ),
  ).toEqual(new Set([1]));
  expect(
    Math.max(
      ...counters.map((counter) => {
        return counter.jsEventListeners;
      }),
    ) -
      Math.min(
        ...counters.map((counter) => {
          return counter.jsEventListeners;
        }),
      ),
  ).toBeLessThanOrEqual(1);
  const nodes = counters.map((counter) => {
    return counter.nodes;
  });
  expect(Math.max(...nodes) / Math.min(...nodes)).toBeLessThanOrEqual(1.1);
}

[
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test.describe(`${viewport.width}px settled memory`, () => {
    // The complete 22-response settlement protocol also runs in the ordinary
    // suite.
    test.setTimeout(180000);
    test.use({ viewport, catalogSize: 10000 });
    test("measures equivalent retained windows after image, seen, request and animation settlement", async ({
      page,
      browserName,
    }) => {
      await _observeActivity(page);
      const pending = new Set<Request>();
      let seenStarted = 0;
      let seenFinished = 0;
      page.on("request", (request) => {
        pending.add(request);
        if (new URL(request.url()).pathname.includes("/seen")) {
          seenStarted += 1;
        }
      });
      const finish = (request: Request) => {
        pending.delete(request);
        if (new URL(request.url()).pathname.includes("/seen")) {
          seenFinished += 1;
        }
      };
      page.on("requestfinished", finish);
      page.on("requestfailed", finish);
      const pageByDay = new Map<string, number>();
      const firstDayByResponse = new Map<number, string>();
      let responses = 0;
      await page.route(
        (url) => {
          return url.pathname === "/api/timeline";
        },
        async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as {
            days: Array<{ capturedOn: string }>;
          };
          responses += 1;
          firstDayByResponse.set(responses, body.days[0]!.capturedOn);
          body.days.forEach((day) => {
            pageByDay.set(day.capturedOn, responses);
          });
          await route.fulfill({ response });
        },
      );
      const cdp =
        browserName === "chromium"
          ? await page.context().newCDPSession(page)
          : undefined;
      const samples: MemorySample[] = [];
      await page.goto("/api/media-evidence/session");
      let sampled = 5;
      for (let step = 0; step < 1700 && sampled < 22; step += 1) {
        await page.evaluate(async () => {
          scrollBy(0, innerHeight * 1.5);
          await new Promise<void>((done) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                done();
              });
            });
          });
        });
        if (responses <= sampled) {
          continue;
        }
        const sampledResponse = responses;
        const anchorDay = firstDayByResponse.get(sampledResponse)!;
        const anchor = page.locator(`[id="day-${anchorDay}"]`);
        await expect(anchor).toBeAttached();
        const expectedTop = await anchor.evaluate((element) => {
          const documentTop = scrollY + element.getBoundingClientRect().top;
          const targetScrollY = Math.round(documentTop - 100);
          scrollTo({ top: targetScrollY, behavior: "instant" });
          return documentTop - targetScrollY;
        });
        await expect
          .poll(() => {
            return anchor.evaluate((element) => {
              return element.getBoundingClientRect().top;
            });
          })
          .toBe(expectedTop);
        await expect
          .poll(
            async () => {
              const ready = await _readReadiness(page);
              const hasCommittedResponse = ready.days.some((day) => {
                return pageByDay.get(day) === responses;
              });
              return (
                hasCommittedResponse &&
                pending.size === 0 &&
                ready.visibleImages > 0 &&
                ready.visibleImages === ready.readyImages &&
                ready.intersectionQuietMs >= 600 &&
                ready.activeAnimations === 0 &&
                ready.documentAnimations === 0 &&
                seenStarted === seenFinished
              );
            },
            { timeout: 15000 },
          )
          .toBe(true);
        expect(responses).toBe(sampledResponse);
        const readiness = await _readReadiness(page);
        const actualTop = await anchor.evaluate((element) => {
          return element.getBoundingClientRect().top;
        });
        expect(actualTop).toBe(expectedTop);
        const pages = [
          ...new Set(
            readiness.days.map((day) => {
              return pageByDay.get(day);
            }),
          ),
        ];
        expect(pages.length).toBeLessThanOrEqual(5);
        expect(readiness.tiles).toBeLessThanOrEqual(200);
        if (cdp) {
          await cdp.send("HeapProfiler.collectGarbage");
        }
        samples.push({
          responses,
          sampleAnchor: { day: anchorDay, expectedTop, actualTop },
          ...readiness,
          pages,
          pendingRequests: pending.size,
          seenStarted,
          seenFinished,
          heap: cdp ? await cdp.send("Runtime.getHeapUsage") : "unavailable",
          dom: cdp ? await cdp.send("Memory.getDOMCounters") : "unavailable",
        });
        if (
          cdp &&
          process.env.MEDIA_HEAP_SNAPSHOT === "1" &&
          (responses === 6 || responses === 22)
        ) {
          const chunks: string[] = [];
          const collect = (event: { chunk: string }) => {
            chunks.push(event.chunk);
          };
          cdp.on("HeapProfiler.addHeapSnapshotChunk", collect);
          await cdp.send("HeapProfiler.takeHeapSnapshot");
          cdp.off("HeapProfiler.addHeapSnapshotChunk", collect);
          await writeFile(
            test.info().outputPath(`settled-${responses}.heapsnapshot`),
            chunks.join(""),
          );
        }
        sampled = responses;
      }
      await writeFile(
        test.info().outputPath("settled-memory.json"),
        JSON.stringify(samples, null, 2),
      );
      expect(sampled).toBe(22);
      _assertSampledConvergence(samples);
    });
  });
});
