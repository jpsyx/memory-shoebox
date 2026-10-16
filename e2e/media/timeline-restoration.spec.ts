import { writeFile } from "node:fs/promises";
import { test, expect } from "./media.fixtures.ts";

[
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test.describe(`${viewport.width}px saved fan`, () => {
    test.use({ viewport });
    test("returns to an inner frame after its collected frame query answers slowly", async ({
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
      await page
        .locator(`[data-burst-id="${cover.burst_id}"] button`)
        .first()
        .click();
      await expect(
        page.getByRole("button", { name: "Collapse" }),
      ).toBeVisible();
      await page.mouse.move(0, 0);
      await page.evaluate(async () => {
        scrollBy(0, innerHeight * 2);
        await new Promise<void>((done) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              done();
            });
          });
        });
      });
      const anchor = await page
        .locator("[data-fan-row] [data-item-id]")
        .evaluateAll((nodes) => {
          const node = nodes.find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.bottom > 80 && rect.top < innerHeight;
          })!;
          return {
            id: node.getAttribute("data-item-id")!,
            top: node.getBoundingClientRect().top,
          };
        });
      await page.getByRole("link", { name: "People", exact: true }).click();
      await expect(page).toHaveURL(/\/people/);
      await expect(page.locator("[data-timeline-pile]")).toHaveCount(0);
      let release: () => void = () => {};
      const barrier = new Promise<void>((done) => {
        release = done;
      });
      let start: () => void = () => {};
      const started = new Promise<void>((done) => {
        start = done;
      });
      let frameRequests = 0;
      await page.route(
        `**/api/bursts/${cover.burst_id}/frames`,
        async (route) => {
          frameRequests += 1;
          start();
          await barrier;
          await route.continue();
        },
      );
      await page.goBack();
      await started;
      await page.mouse.move(0, 0);
      const before = await page.evaluate(() => {
        return {
          y: scrollY,
          tiles: document.querySelectorAll('[data-photo-surface="pile"]')
            .length,
        };
      });
      release();
      const frame = page.locator(`[data-item-id="${anchor.id}"]`);
      await expect(frame).toBeAttached();
      await expect
        .poll(async () => {
          return Math.abs(
            (await frame.evaluate((node) => {
              return node.getBoundingClientRect().top;
            })) - anchor.top,
          );
        })
        .toBeLessThanOrEqual(2);
      expect(frameRequests).toBe(1);
      expect(
        await page.locator('[data-photo-surface="pile"]').count(),
      ).toBeLessThanOrEqual(200);
      await writeFile(
        test.info().outputPath("fan-restoration.json"),
        JSON.stringify(
          {
            anchor,
            before,
            after: await frame.evaluate((node) => {
              return { top: node.getBoundingClientRect().top, y: scrollY };
            }),
            frameRequests,
          },
          null,
          2,
        ),
      );
    });
  });
});
