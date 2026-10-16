import { writeFile } from "node:fs/promises";

import { expect, test } from "../../media.fixtures.ts";

[
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test.describe(`${viewport.width}px expanded fan`, () => {
    test.use({ viewport });
    test("packs mismatched original and thumbnail aspects into one physical line through loading and failure", async ({
      page,
      catalog,
    }) => {
      const cover = await catalog.database
        .selectFrom("items")
        .select("burst_id")
        .where("id", "=", catalog.itemIds[3]!)
        .executeTakeFirstOrThrow();
      for (let index = 100; index < 115; index++) {
        await catalog.database
          .updateTable("items")
          .set({ burst_id: cover.burst_id, burst_index: index - 95 })
          .where("id", "=", catalog.itemIds[index]!)
          .execute();
      }
      await catalog.database
        .updateTable("items")
        .set({ width: 4032, height: 3024 })
        .where("burst_id", "=", cover.burst_id)
        .execute();
      let release!: () => void;
      let started!: () => void;
      const held = new Promise<void>((done) => {
        release = done;
      });
      const requested = new Promise<void>((done) => {
        started = done;
      });
      let itemId = "";
      await page.route(
        `**/api/bursts/${cover.burst_id}/frames`,
        async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          expect(body.frames).toHaveLength(20);
          const frame = body.frames.find((entry: { position: number }) => {
            return entry.position === 2;
          });
          expect([
            frame.width,
            frame.height,
            frame.thumb.width,
            frame.thumb.height,
          ]).toEqual([4032, 3024, 400, 267]);
          itemId = frame.itemId;
          await page.route(frame.thumb.url, async (imageRoute) => {
            started();
            await held;
            await imageRoute.continue();
          });
          await route.fulfill({ response });
        },
      );
      await page.goto("/api/media-evidence/session");
      await page
        .locator(`[data-burst-id="${cover.burst_id}"] button`)
        .first()
        .click();
      await requested;
      const image = page.locator(`button[data-item-id="${itemId}"] img`);
      const geometry = async () => {
        return page
          .locator(`[data-fan-row="${cover.burst_id}"]`)
          .evaluateAll((rows, targetId) => {
            return {
              lines: rows.flatMap((row) => {
                const buttons = [
                  ...row.querySelectorAll<HTMLElement>("button[data-item-id]"),
                ];
                if (!buttons.length) {
                  return [];
                }
                return [
                  {
                    key: (row as HTMLElement).dataset.timelineRow,
                    tops: buttons.map((button) => {
                      let child: HTMLElement = button;
                      while (child.parentElement !== row) {
                        if (!child.parentElement) {
                          throw new Error("Frame escaped its owning row");
                        }
                        child = child.parentElement;
                      }
                      return child.offsetTop;
                    }),
                    ids: buttons.map((button) => {
                      return button.dataset.itemId;
                    }),
                  },
                ];
              }),
              image: (() => {
                const currentImage = document.querySelector<HTMLImageElement>(
                  `button[data-item-id="${targetId}"] img`,
                )!;
                const rectangle = currentImage.getBoundingClientRect();
                return {
                  height: rectangle.height,
                  width: rectangle.width,
                  rowHeight: currentImage
                    .closest("[data-timeline-row]")!
                    .getBoundingClientRect().height,
                  complete: currentImage.complete,
                  naturalWidth: currentImage.naturalWidth,
                };
              })(),
            };
          }, itemId);
      };
      const pending = await geometry();
      expect(pending.image.complete).toBe(false);
      release();
      await expect
        .poll(() => {
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
        .poll(() => {
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
        test.info().outputPath("fan-line-geometry.json"),
        JSON.stringify({ pending, loaded, failed }, null, 2),
      );
      [pending, loaded, failed].forEach((sample) => {
        expect(sample.lines.length).toBeGreaterThan(1);
        sample.lines.forEach((line) => {
          expect(new Set(line.tops).size).toBe(1);
        });
        (["height", "width", "rowHeight"] as const).forEach((key) => {
          expect(
            Math.abs(sample.image[key] - pending.image[key]),
          ).toBeLessThanOrEqual(0.5);
        });
      });
    });
    test("bounds 200 frames and preserves the focused DOM node through resize and selection", async ({
      page,
      catalog,
    }) => {
      const cover = await catalog.database
        .selectFrom("items")
        .select("burst_id")
        .where("id", "=", catalog.itemIds[3]!)
        .executeTakeFirstOrThrow();
      for (let index = 100; index < 295; index++) {
        await catalog.database
          .updateTable("items")
          .set({ burst_id: cover.burst_id, burst_index: index - 95 })
          .where("id", "=", catalog.itemIds[index]!)
          .execute();
      }
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
        (window as typeof window & { focusedNode: Element }).focusedNode = node;
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
        for (let frame = 0; frame < 8; frame++) {
          await new Promise<void>((done) => {
            return requestAnimationFrame(() => {
              return done();
            });
          });
        }
      });
      await test.info().attach("resize-offsets", {
        body: JSON.stringify({ reading, samples: await samples }),
        contentType: "application/json",
      });
      expect(
        await focusedFrame.evaluate((node) => {
          return (
            node ===
              (window as typeof window & { focusedNode: Element })
                .focusedNode && node === document.activeElement
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
        (window as typeof window & { selectedNode: Element }).selectedNode =
          node;
      });
      await page.setViewportSize(viewport);
      expect(
        await selectedFrame.evaluate((node) => {
          return (
            node ===
              (window as typeof window & { selectedNode: Element })
                .selectedNode && node === document.activeElement
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
});
