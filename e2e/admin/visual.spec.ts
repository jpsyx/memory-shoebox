import { mkdir } from "node:fs/promises";
import { test, expect } from "./admin.fixtures.ts";
import { getContrastFailuresFromPage } from "../support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";

const DIRECTORY = ".playwright-mcp/step9-acceptance/live/final-admin";
const STATES = {
  settings: ["default", "renaming", "tidy", "timezone", "mail-failing"],
  presence: ["default", "never-arrived", "one-item"],
  changes: ["default", "authority", "person", "gone", "empty"],
} as const;

for (const [surface, states] of Object.entries(STATES)) {
  for (const state of states) {
    test(`${surface}/${state} fits all three widths and both actual OS schemes`, async ({
      page,
      catalog,
    }) => {
      const directory =
        state === "timezone"
          ? ".playwright-mcp/step9-acceptance/live/final-timezone-preview"
          : DIRECTORY;
      await mkdir(directory, { recursive: true });
      if (surface === "changes" && state !== "empty") {
        const headers = { cookie: catalog.admin.cookie };
        await catalog.app.inject({
          method: "PATCH",
          url: "/api/settings",
          headers,
          payload: { shoebox: { name: "The Ruiz Shoebox" } },
        });
        await catalog.app.inject({
          method: "PATCH",
          url: `/api/members/${catalog.secondAdmin}`,
          headers,
          payload: { role: "uploader" },
        });
        await catalog.app.inject({
          method: "DELETE",
          url: "/api/items/00000000-0000-4000-8000-000000000010",
          headers,
        });
      }
      const query =
        surface === "presence" && state === "one-item"
          ? `?itemId=${catalog.itemId}`
          : state === "authority"
            ? "?family=authority"
            : state === "person"
              ? `?actorMemberId=${catalog.admin.memberId}`
              : state === "gone"
                ? "?subjectId=00000000-0000-4000-8000-000000000010"
                : "";
      for (const width of [400, 768, 1280]) {
        for (const scheme of ["light", "dark"] as const) {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({
            colorScheme: scheme,
            reducedMotion: "reduce",
          });
          await page.goto(
            `/api/evidence/session/admin?to=${encodeURIComponent(`/${surface}${query}`)}`,
          );
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          if (state === "renaming")
            await page
              .getByLabel("Shoebox name", { exact: true })
              .fill("Our family memories");
          if (state === "tidy")
            await page
              .getByRole("radiogroup", { name: "Pile arrangement" })
              .getByText("Tidy", { exact: true })
              .click();
          if (state === "timezone") {
            await page
              .getByLabel("This Shoebox's timezone", { exact: true })
              .selectOption("America/New_York");
            await page
              .getByRole("button", { name: "Preview timezone change" })
              .click();
            await expect(
              page.getByRole("button", { name: "Confirm timezone change" }),
            ).toBeVisible();
            await expect(
              page.getByText("Changing this moves photographs between days."),
            ).toBeVisible();
          }
          if (surface === "presence")
            await expect(
              page.getByText("Abuela Rosa", { exact: true }).first(),
            ).toBeVisible();
          if (surface === "changes")
            await expect(
              page.getByRole("region", { name: "What has been changed" }),
            ).toBeVisible();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
              Array.from(document.images, (image) => {
                return image.decode().catch(() => {});
              }),
            );
          });
          expect(
            await page.evaluate(() => {
              return document.documentElement.scrollWidth <= innerWidth;
            }),
          ).toBe(true);
          expect(
            await page.evaluate(() => {
              return getComputedStyle(document.body).backgroundColor;
            }),
          ).toBe(scheme === "light" ? "rgb(201, 214, 237)" : "rgb(13, 24, 54)");
          await page.evaluate(async () => {
            window.scrollTo(0, 0);
            await new Promise(requestAnimationFrame);
            await new Promise(requestAnimationFrame);
          });
          await page.screenshot({
            path: `${directory}/${surface}-${state}-${width}-${scheme === "light" ? "day" : "night"}.png`,
            fullPage: true,
          });
          if (state === "timezone") {
            const impact = await page
              .getByRole("region", {
                name: "What time it is here",
                exact: true,
              })
              .boundingBox();
            expect(impact).not.toBeNull();
            await page.screenshot({
              path: `${directory}/impact-${width}-${scheme}.png`,
              fullPage: true,
              clip: impact!,
            });
            const confirmation = await page
              .getByRole("button", { name: "Confirm timezone change" })
              .boundingBox();
            expect(confirmation).not.toBeNull();
            expect(confirmation!.x + confirmation!.width).toBeLessThanOrEqual(
              width,
            );
          }
          if (width === 400 && state === "default")
            expect(await getContrastFailuresFromPage(page)).toEqual([]);
        }
      }
    });
  }
}
