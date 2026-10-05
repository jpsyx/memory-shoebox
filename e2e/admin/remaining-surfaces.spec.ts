import type { Page } from "@playwright/test";
import type { AcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";
import { waitForVisualMedia } from "./support/waitForVisualMedia.ts";
import { mkdir } from "node:fs/promises";
import { test, expect } from "./admin.fixtures.ts";
type RemainingSurfaceCapture = {
  page: Page;
  catalog: AcceptanceCatalog;
  state: string;
  width: number;
  scheme: "light" | "dark";
};
const DIRECTORY: string =
  ".playwright-mcp/step9-acceptance/live/final-remaining";

async function _prepareRemainingSurface({
  page,
  catalog,
  state,
  width,
  scheme,
}: Readonly<RemainingSurfaceCapture>): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({
    colorScheme: scheme,
    reducedMotion: "reduce",
  });
  const target =
    state === "sign-in-email"
      ? "/sign-in"
      : state.startsWith("empty-")
        ? `/api/evidence/session/${state === "empty-new" ? "admin" : "viewer"}?to=/`
        : state === "removal-ask"
          ? `/api/evidence/session/viewer?to=/items/${catalog.videoId}`
          : "/api/evidence/session/admin?to=/removal-requests";
  await page.goto(target);
  if (state === "removal-ask") {
    await page
      .getByRole("link", {
        name: "Ask for this to come down",
        exact: true,
      })
      .click();
  }
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (state === "removal-requests-open") {
    await expect(
      page.getByRole("button", { name: "Keep it, and say why" }),
    ).toBeVisible();
  }
  if (state.startsWith("empty-")) {
    await expect(page.getByText("The first week")).toHaveCount(0);
  }
}
async function _captureRemainingSurface(
  options: Readonly<RemainingSurfaceCapture>,
): Promise<void> {
  const { page, state, width, scheme } = options;
  await _prepareRemainingSurface(options);
  await waitForVisualMedia(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
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
  await page.screenshot({
    path: `${DIRECTORY}/${state}-${width}-${scheme === "light" ? "day" : "night"}.png`,
    fullPage: true,
  });
}
(
  [
    "sign-in-email",
    "empty-new",
    "empty-restricted",
    "removal-ask",
    "removal-requests-open",
  ] as const
).forEach((state) => {
  test(`${state} shows its heading, fits horizontally and uses the scheme background`, async ({
    page,
    catalog,
  }) => {
    if (state.startsWith("empty-")) {
      await catalog.database.deleteFrom("removal_requests").execute();
      await catalog.database.deleteFrom("items").execute();
      await catalog.database.deleteFrom("milestones").execute();
    }
    await mkdir(DIRECTORY, { recursive: true });
    for (const width of [400, 768, 1280]) {
      for (const scheme of ["light", "dark"] as const) {
        await _captureRemainingSurface({ page, catalog, state, width, scheme });
      }
    }
  });
});
