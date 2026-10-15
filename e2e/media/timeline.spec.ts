import { writeFile } from "node:fs/promises";
import { test, expect } from "./media.fixtures.ts";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px timeline`, () => {
    test.use({ viewport });
    test("reserves identical intrinsic geometry before entry, while loading, loaded, and failed", async ({
      page,
      catalog,
    }) => {
      await catalog.database
        .updateTable("items")
        .set({
          alt_text:
            "A family memory with a longer accessible photo description",
        })
        .execute();
      const metadata = page.waitForResponse((response) => {
        return new URL(response.url()).pathname === "/api/timeline";
      });
      await page.goto("/api/media-evidence/session");
      await expect(page.locator("[data-item-id]").first()).toBeVisible();
      const body = await (await metadata).json();
      const id = await page.locator("[data-item-id]").evaluateAll((nodes) => {
        return nodes
          .find((node) => {
            return (
              node.getBoundingClientRect().top > innerHeight + 20 &&
              node.querySelector("img")?.getAttribute("src") === null
            );
          })
          ?.getAttribute("data-item-id");
      });
      expect(id).toBeTruthy();
      const source = body.days
        .flatMap(
          (day: {
            items: Array<{ itemId: string; media: { thumb: { url: string } } }>;
          }) => {
            return day.items;
          },
        )
        .find((item: { itemId: string }) => {
          return item.itemId === id;
        }).media.thumb.url;
      const image = page.locator(`[data-item-id="${id}"] img`);
      const geometry = async () => {
        return image.evaluate((node) => {
          return {
            image: node.getBoundingClientRect().height,
            print: node.closest("button")!.getBoundingClientRect().height,
            row: node.closest("[data-timeline-row]")!.getBoundingClientRect()
              .height,
            width: node.getBoundingClientRect().width,
            complete: (node as HTMLImageElement).complete,
            naturalWidth: (node as HTMLImageElement).naturalWidth,
          };
        });
      };
      const absent = await geometry();
      let release: () => void = () => {};
      const barrier = new Promise<void>((done) => {
        release = done;
      });
      let started: () => void = () => {};
      const request = new Promise<void>((done) => {
        started = done;
      });
      await page.route(source, async (route) => {
        started();
        await barrier;
        await route.continue();
      });
      await image.evaluate((node) => {
        node.scrollIntoView({ block: "center" });
      });
      await request;
      const pending = await geometry();
      release();
      await expect
        .poll(async () => {
          return image.evaluate((node) => {
            return (node as HTMLImageElement).naturalWidth;
          });
        })
        .toBeGreaterThan(0);
      const loaded = await geometry();
      await image.evaluate((node) => {
        (node as HTMLImageElement).src = "/api/media-evidence/missing-image";
      });
      await expect
        .poll(async () => {
          return image.evaluate((node) => {
            return (
              (node as HTMLImageElement).complete &&
              (node as HTMLImageElement).naturalWidth === 0
            );
          });
        })
        .toBe(true);
      const failed = await geometry();
      await writeFile(
        test.info().outputPath("image-geometry.json"),
        JSON.stringify({ absent, pending, loaded, failed }, null, 2),
      );
      for (const state of [pending, loaded, failed])
        expect(Math.abs(state.image - absent.image)).toBeLessThanOrEqual(0.5);
    });
    test("bounds a 1,000-item atomic day and withholds unentered overscan sources", async ({
      page,
      catalog,
    }) => {
      const seen = page.waitForResponse(
        (response) => {
          return new URL(response.url()).pathname === "/api/items/seen";
        },
        { timeout: 10000 },
      );
      await page.goto("/api/media-evidence/session");
      await expect(
        page.locator('[data-photo-surface="pile"]').first(),
      ).toBeVisible();
      await expect
        .poll(() => {
          return page.locator('[data-photo-surface="pile"]').count();
        })
        .toBeLessThanOrEqual(200);
      await expect
        .poll(() => {
          return page.locator('img[loading="eager"]').count();
        })
        .toBeLessThanOrEqual(6);
      const offscreen = await page
        .locator('[data-photo-surface="pile"] img')
        .evaluateAll((images) => {
          return images
            .filter((image) => {
              return image.getBoundingClientRect().top > innerHeight + 20;
            })
            .map((image) => {
              return {
                src: image.getAttribute("src"),
                top: image.getBoundingClientRect().top,
              };
            });
        });
      const overscanIds = await page
        .locator("[data-item-id]")
        .evaluateAll((nodes) => {
          return nodes
            .filter((node) => {
              return node.getBoundingClientRect().top > innerHeight + 20;
            })
            .map((node) => {
              return node.getAttribute("data-item-id")!;
            });
        });
      expect((await seen).status()).toBe(204);
      const overscanSeenDelta = (
        await catalog.database
          .selectFrom("item_views")
          .select("item_id")
          .where("member_id", "=", catalog.memberId)
          .where("item_id", "in", overscanIds)
          .execute()
      ).length;
      expect(overscanSeenDelta).toBe(0);
      expect(offscreen.length).toBeGreaterThan(0);
      expect(
        offscreen.every((image) => {
          return image.src === null;
        }),
      ).toBe(true);
      const initial = await page.locator('[data-photo-surface="pile"]').count();
      await page.evaluate(() => {
        return window.scrollBy(0, innerHeight * 2);
      });
      await expect
        .poll(() => {
          return page.locator('[data-photo-surface="pile"]').count();
        })
        .toBeLessThanOrEqual(200);
      expect(initial).toBeGreaterThan(0);
    });
  });
}

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
              for (let frame = 0; frame < 6; frame++)
                await new Promise<void>((done) => {
                  return requestAnimationFrame(() => {
                    return done();
                  });
                });
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
              if (anchor.reading)
                evictionDeltas.push(
                  sample.readingTop === undefined
                    ? Infinity
                    : Math.abs(sample.readingTop - anchor.reading.top),
                );
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
        )
          return;
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
          )
            return;
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
        for (let frame = 0; frame < 8; frame++)
          await new Promise<void>((done) => {
            return requestAnimationFrame(() => {
              return done();
            });
          });
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

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px expanded fan`, () => {
    test.use({ viewport });
    test("bounds 200 frames and preserves the focused DOM node through resize and selection", async ({
      page,
      catalog,
    }) => {
      const cover = await catalog.database
        .selectFrom("items")
        .select("burst_id")
        .where("id", "=", catalog.itemIds[3]!)
        .executeTakeFirstOrThrow();
      for (let index = 100; index < 295; index++)
        await catalog.database
          .updateTable("items")
          .set({ burst_id: cover.burst_id, burst_index: index - 95 })
          .where("id", "=", catalog.itemIds[index]!)
          .execute();
      await page.goto("/api/media-evidence/session");
      const stack = page
        .locator(`[data-burst-id="${cover.burst_id}"] button`)
        .first();
      await stack.click();
      await expect(
        page.getByRole("button", { name: "Collapse" }),
      ).toBeVisible();
      await page.evaluate(() => {
        window.scrollBy(0, innerHeight * 2);
        return new Promise<void>((done) => {
          return requestAnimationFrame(() => {
            return requestAnimationFrame(() => {
              return done();
            });
          });
        });
      });
      const focusId = await page
        .locator("[data-fan-row] [data-item-id]")
        .evaluateAll((nodes) => {
          return nodes
            .find((node) => {
              return (
                node.getBoundingClientRect().bottom > 80 &&
                node.getBoundingClientRect().top < innerHeight
              );
            })!
            .getAttribute("data-item-id");
        });
      const focusedFrame = page.locator(`[data-item-id="${focusId}"]`);
      const visibleImage = focusedFrame.locator("img");
      await page.waitForLoadState("networkidle");
      await writeFile(
        test.info().outputPath("fan-images.json"),
        JSON.stringify(
          await page.locator("[data-fan-row] img").evaluateAll((images) => {
            return images.map((node) => {
              return {
                src: node.getAttribute("src"),
                naturalWidth: (node as HTMLImageElement).naturalWidth,
                complete: (node as HTMLImageElement).complete,
                rect: node.getBoundingClientRect().toJSON(),
              };
            });
          }),
          null,
          2,
        ),
      );
      await expect
        .poll(() => {
          return visibleImage.evaluate((node) => {
            return (node as HTMLImageElement).naturalWidth;
          });
        })
        .toBeGreaterThan(0);
      await page.screenshot({ path: test.info().outputPath("fan-loaded.png") });

      await focusedFrame.evaluate((node) => {
        return (node as HTMLElement).focus({ preventScroll: true });
      });
      await focusedFrame.evaluate((node) => {
        (window as unknown as { focusedNode: Element }).focusedNode = node;
      });
      const reading = await page
        .locator("[data-item-id]")
        .evaluateAll((nodes) => {
          const node = nodes.find((candidate) => {
            return (
              candidate.getBoundingClientRect().bottom > 80 &&
              candidate.getBoundingClientRect().top < innerHeight
            );
          })!;
          return {
            id: node.getAttribute("data-item-id")!,
            top: node.getBoundingClientRect().top,
          };
        });
      const samples = page.evaluate(async (id) => {
        const result = [];
        for (let frame = 0; frame < 16; frame++) {
          await new Promise<void>((done) => {
            return requestAnimationFrame(() => {
              return done();
            });
          });
          const node = document.querySelector<HTMLElement>(
            `[data-item-id="${id}"]`,
          )!;
          const row = node.closest<HTMLElement>("[data-timeline-row]")!;
          result.push({
            frame,
            top: node.getBoundingClientRect().top,
            y: scrollY,
            width: innerWidth,
            rowKey: row.dataset.timelineRow,
            rowHeight: row.getBoundingClientRect().height,
            rowTop: row.style.top,
            transform: getComputedStyle(node).transform,
          });
        }
        return result;
      }, reading.id);
      await page.setViewportSize({
        width: viewport.width === 390 ? 430 : 1000,
        height: viewport.height,
      });
      await page.evaluate(async () => {
        for (let frame = 0; frame < 8; frame++)
          await new Promise<void>((done) => {
            return requestAnimationFrame(() => {
              return done();
            });
          });
      });
      await test.info().attach("resize-offsets", {
        body: JSON.stringify({ reading, samples: await samples }),
        contentType: "application/json",
      });
      expect(
        await focusedFrame.evaluate((node) => {
          return (
            node ===
              (window as unknown as { focusedNode: Element }).focusedNode &&
            node === document.activeElement
          );
        }),
      ).toBe(true);
      expect(
        Math.abs(
          (await page
            .locator(`[data-item-id="${reading.id}"]`)
            .evaluate((node) => {
              return node.getBoundingClientRect().top;
            })) - reading.top,
        ),
      ).toBeLessThanOrEqual(2);
      expect(
        await page.locator('[data-photo-surface="pile"]').count(),
      ).toBeLessThanOrEqual(200);
      await focusedFrame.press("Escape");
      await expect(page.getByRole("button", { name: "Collapse" })).toHaveCount(
        0,
      );
      await expect(stack).toBeFocused();
      await page.getByRole("button", { name: "Select photos" }).click();
      await page
        .locator(`[data-burst-id="${cover.burst_id}"] button`)
        .first()
        .click();
      const selectedFrame = page.locator(
        `[data-item-id="${catalog.itemIds[3]}"]`,
      );
      await selectedFrame.click();
      await expect(selectedFrame).toHaveAttribute("aria-pressed", "true");
      await selectedFrame.evaluate((node) => {
        return (node as HTMLElement).focus({ preventScroll: true });
      });
      await expect(selectedFrame).toBeFocused();
      await selectedFrame.evaluate((node) => {
        (window as unknown as { selectedNode: Element }).selectedNode = node;
      });
      await page.setViewportSize(viewport);
      expect(
        await selectedFrame.evaluate((node) => {
          return (
            node ===
              (window as unknown as { selectedNode: Element }).selectedNode &&
            node === document.activeElement
          );
        }),
      ).toBe(true);
      await page.evaluate(() => {
        return window.scrollBy(0, innerHeight * 8);
      });
      expect(
        await page.locator('[data-photo-surface="pile"]').count(),
      ).toBeLessThanOrEqual(200);
      await page.evaluate(() => {
        return window.scrollTo(0, 0);
      });
      await expect(selectedFrame).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: "Collapse" }),
      ).toBeDisabled();
    });
  });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px jump and reverse`, () => {
    test.use({ viewport });
    test("keeps the jump boundary through forward eviction and reversal, then changes the effective filter", async ({
      page,
    }) => {
      test.setTimeout(60000);
      const responses: Array<{
        url: URL;
        days: string[];
        nextCursor: string | null;
        previousCursor: string | null;
      }> = [];
      page.on("response", async (response) => {
        if (
          new URL(response.url()).pathname !== "/api/timeline" ||
          !response.ok()
        )
          return;
        const body = await response.json();
        responses.push({
          url: new URL(response.url()),
          days: body.days.map((day: { capturedOn: string }) => {
            return day.capturedOn;
          }),
          nextCursor: body.nextCursor,
          previousCursor: body.previousCursor,
        });
      });
      await page.goto("/api/media-evidence/session");
      await page.getByRole("combobox", { name: "Jump to" }).click();
      await page.getByRole("option", { name: /^20 sep / }).click();
      await expect(page).toHaveURL(/at=2026-09-20/);
      await expect(page.locator('[id="day-2026-09-20"]')).toBeAttached();
      for (
        let step = 0;
        step < 50 &&
        responses.filter((response) => {
          return response.url.searchParams.get("until") === "2026-09-20";
        }).length < 7;
        step++
      ) {
        const count = responses.length;
        await expect
          .poll(async () => {
            if (responses.length > count) return responses.length;
            await page.evaluate(() => {
              return scrollTo(0, document.documentElement.scrollHeight);
            });
            return responses.length;
          })
          .toBeGreaterThan(count);
        const response = responses.at(-1)!;
        await expect(
          page.locator(`[id="day-${response.days.at(-1)}"]`),
        ).toBeAttached();
      }
      const bounded = responses.filter((response) => {
        return response.url.searchParams.get("until") === "2026-09-20";
      });
      expect(bounded.length).toBeGreaterThanOrEqual(7);
      expect(
        bounded
          .flatMap((response) => {
            return response.days;
          })
          .every((day) => {
            return day <= "2026-09-20";
          }),
      ).toBe(true);
      const firstRetainedDay = await page
        .locator('[id^="day-"]')
        .first()
        .getAttribute("id");
      const firstPage = bounded.find((response) => {
        return response.days[0] === firstRetainedDay?.slice(4);
      });
      expect(firstPage).toBeDefined();
      const requested = firstPage!.previousCursor;
      expect(requested).toBeTruthy();
      const reverseRequest = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          url.pathname === "/api/timeline" &&
          url.searchParams.get("cursor") === requested
        );
      });
      const reverse = page.waitForResponse((response) => {
        return new URL(response.url()).searchParams.get("cursor") === requested;
      });
      await page.evaluate(() => {
        scrollTo(0, 0);
      });
      expect(
        new URL((await reverseRequest).url()).searchParams.get("until"),
      ).toBe("2026-09-20");
      const response = await reverse;
      expect(response.ok()).toBe(true);
      const newerPage = await response.json();
      expect(newerPage.days[0].capturedOn < "2026-09-21").toBe(true);
      expect(newerPage.days[0].capturedOn > firstPage!.days[0]!).toBe(true);
      await expect(
        page.locator(`[id="day-${newerPage.days[0].capturedOn}"]`),
      ).toBeAttached();
      expect(
        await page.locator('[data-photo-surface="pile"]').count(),
      ).toBeLessThanOrEqual(200);
      await page.goto("/?at=2026-09-20&from=2026-09-01");
      await page.getByRole("button", { name: "Clear the dates" }).click();
      await expect(page).not.toHaveURL(/at=|from=/);
      await expect(page.locator('[id="day-2026-10-13"]')).toBeAttached();
      expect(
        await page.locator('[data-photo-surface="pile"]').count(),
      ).toBeLessThanOrEqual(200);
    });
  });
}
