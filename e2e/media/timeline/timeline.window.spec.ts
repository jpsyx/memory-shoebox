import { writeFile } from "node:fs/promises";

import { expect, test } from "../media.fixtures.ts";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
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
      const memorySamples: unknown[] = [];
      let memoryBoundary = 0;
      const pageByDay = new Map<string, number>();
      const days = new Map<string, number>();
      const evictionDeltas: number[] = [];
      const diagnostics: unknown[] = [];

      let requests = 0;
      let inFlight = 0;
      await page.route(
        (url) => {
          return url.pathname === "/api/timeline";
        },
        async (route) => {
          inFlight += 1;
          const response = await route.fetch();
          const body = (await response.json()) as {
            days: Array<{ capturedOn: string; itemCount: number }>;
          };
          body.days.forEach((day) => {
            return days.set(day.capturedOn, day.itemCount);
          });
          requests += 1;
          body.days.forEach((day) => {
            return pageByDay.set(day.capturedOn, requests);
          });
          const anchor =
            requests >= 5
              ? await page.locator("[data-item-id]").evaluateAll((nodes) => {
                  (
                    window as unknown as { timelinePublishing: boolean }
                  ).timelinePublishing = true;
                  const node = nodes.find((value) => {
                    const rect = value.getBoundingClientRect();
                    return rect.top >= 80 && rect.top < innerHeight;
                  });
                  const readingNode = nodes.find((candidate) => {
                    return (
                      candidate.getBoundingClientRect().bottom > 80 &&
                      candidate.getBoundingClientRect().top < innerHeight
                    );
                  });
                  const reading = readingNode
                    ? {
                        id: readingNode.getAttribute("data-item-id")!,
                        top: readingNode.getBoundingClientRect().top,
                        row: readingNode
                          .closest("[data-timeline-row]")
                          ?.getBoundingClientRect()
                          .toJSON(),
                      }
                    : undefined;
                  return node
                    ? {
                        reading,
                        id: node.getAttribute("data-item-id")!,
                        top: node.getBoundingClientRect().top,
                        y: scrollY,
                        intent: (window as unknown as { scrollIntent: number })
                          .scrollIntent,
                      }
                    : null;
                })
              : null;
          const samples = anchor
            ? page.evaluate(async ({ id, reading }) => {
                const result = [];
                for (let frame = 0; frame < 12; frame++) {
                  await new Promise<void>((done) => {
                    return requestAnimationFrame(() => {
                      return done();
                    });
                  });
                  const node = document.querySelector(`[data-item-id="${id}"]`);
                  const readingNode = document.querySelector(
                    `[data-item-id="${reading?.id}"]`,
                  );
                  result.push({
                    readingTop: readingNode?.getBoundingClientRect().top,
                    readingRow: readingNode
                      ?.closest("[data-timeline-row]")
                      ?.getBoundingClientRect()
                      .toJSON(),
                    targetRow: node
                      ?.closest("[data-timeline-row]")
                      ?.getBoundingClientRect()
                      .toJSON(),
                    frame,
                    top: node?.getBoundingClientRect().top,
                    y: scrollY,
                    intent: (window as unknown as { scrollIntent: number })
                      .scrollIntent,
                    days: [...document.querySelectorAll('[id^="day-"]')].map(
                      (day) => {
                        return day.id;
                      },
                    ),
                  });
                }
                return result;
              }, anchor)
            : undefined;
          await route.fulfill({ response });
          if (anchor) {
            await page
              .locator(`[id="day-${body.days.at(-1)!.capturedOn}"]`)
              .waitFor({ state: "attached" });
            await page.evaluate(async () => {
              for (let frame = 0; frame < 6; frame++) {
                await new Promise<void>((done) => {
                  return requestAnimationFrame(() => {
                    return done();
                  });
                });
              }
            });
            const top = await page
              .locator(`[data-item-id="${anchor.id}"]`)
              .evaluateAll((nodes) => {
                return nodes[0]?.getBoundingClientRect().top;
              });
            const frameSamples = await samples;
            expect(
              frameSamples?.every((frame) => {
                return frame.intent === anchor.intent;
              }),
              "no intentional scroll overlaps publication",
            ).toBe(true);
            diagnostics.push({
              request: requests,
              anchor,
              top,
              frames: frameSamples,
              y: await page.evaluate(() => {
                return scrollY;
              }),
            });
            frameSamples?.forEach((frame) => {
              return evictionDeltas.push(
                frame.top === undefined
                  ? Infinity
                  : Math.abs(frame.top - anchor.top),
              );
            });
            frameSamples?.forEach((sample) => {
              if (anchor.reading) {
                evictionDeltas.push(
                  sample.readingTop === undefined
                    ? Infinity
                    : Math.abs(sample.readingTop - anchor.reading.top),
                );
              }
            });
            expect(
              top,
              "reading tile survives the retained-page replacement",
            ).toBeDefined();
            evictionDeltas.push(Math.abs(top! - anchor.top));
          }
          await page.evaluate(() => {
            (
              window as unknown as { timelinePublishing: boolean }
            ).timelinePublishing = false;
          });
          inFlight -= 1;
        },
      );
      page.on("response", async (response) => {
        if (
          new URL(response.url()).pathname !== "/api/timeline" ||
          !response.ok()
        ) {
          return;
        }
        const body = (await response.json()) as {
          days: Array<{ capturedOn: string; itemCount: number }>;
        };
        body.days.forEach((day) => {
          return days.set(day.capturedOn, day.itemCount);
        });
      });
      await page.goto("/api/media-evidence/session");
      await expect(page.locator("[data-item-id]").first()).toBeVisible();
      await page
        .locator("[data-item-id]")
        .first()
        .evaluate((node) => {
          (node as HTMLElement).focus({ preventScroll: true });
          (
            window as unknown as { evictedFocusNode: Element }
          ).evictedFocusNode = node;
        });
      let maxTiles = 0;
      for (
        let step = 0;
        step < 700 &&
        [...days.values()].reduce((total, count) => {
          return total + count;
        }, 0) < 5000;
        step += 1
      ) {
        await page.evaluate(() => {
          if (
            (window as unknown as { timelinePublishing: boolean })
              .timelinePublishing
          ) {
            return;
          }
          (window as unknown as { scrollIntent: number }).scrollIntent =
            ((window as unknown as { scrollIntent: number }).scrollIntent ??
              0) + 1;
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
            return inFlight;
          })
          .toBe(0);
        maxTiles = Math.max(
          maxTiles,
          await page.locator('[data-photo-surface="pile"]').count(),
        );
        expect(maxTiles).toBeLessThanOrEqual(200);
        const retainedDays = await page
          .locator('[id^="day-"]')
          .evaluateAll((nodes) => {
            return nodes.map((node) => {
              return node.id.slice(4);
            });
          });
        const retainedPages = new Set(
          retainedDays
            .filter((day) => {
              return !(requests > 5 && day === "2026-10-13");
            })
            .map((day) => {
              return pageByDay.get(day);
            }),
        );
        expect(retainedPages.size).toBeLessThanOrEqual(5);
        const traversed = [...days.values()].reduce((total, count) => {
          return total + count;
        }, 0);
        if (cdp && traversed >= memoryBoundary + 1000) {
          memoryBoundary = traversed;
          await page.waitForLoadState("networkidle");
          await cdp.send("HeapProfiler.collectGarbage");
          memorySamples.push({
            traversed,
            tiles: maxTiles,
            pages: retainedPages.size,
            ...(await cdp.send("Runtime.getHeapUsage")),
            ...(await cdp.send("Memory.getDOMCounters")),
          });
        }
      }
      expect(
        [...days.values()].reduce((total, count) => {
          return total + count;
        }, 0),
      ).toBe(5000);
      expect(
        await page.evaluate(() => {
          const node = (window as unknown as { evictedFocusNode: Element })
            .evictedFocusNode;
          return node.isConnected && node === document.activeElement;
        }),
      ).toBe(true);
      expect(evictionDeltas.length).toBeGreaterThan(0);
      for (const [name, evidence] of [
        ["eviction-offsets", diagnostics],
        ["resident-memory", memorySamples],
      ] as const) {
        const path = test.info().outputPath(`${name}.json`);
        await writeFile(path, JSON.stringify(evidence, null, 2));
        await test
          .info()
          .attach(name, { path, contentType: "application/json" });
      }
      expect(Math.max(...evictionDeltas)).toBeLessThanOrEqual(2);
      const anchor = await page
        .locator("[data-item-id]")
        .evaluateAll((nodes) => {
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
      const box = await page
        .locator(`[data-item-id="${anchor.id}"]`)
        .boundingBox();
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
    });
  });
}
