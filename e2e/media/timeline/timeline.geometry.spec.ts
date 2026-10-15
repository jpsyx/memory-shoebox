import { writeFile } from "node:fs/promises";

import { expect, test } from "../media.fixtures.ts";

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
      for (const state of [pending, loaded, failed]) {
        expect(Math.abs(state.image - absent.image)).toBeLessThanOrEqual(0.5);
      }
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
