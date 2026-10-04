import {
  SURFACE_STATES,
  prepareSurfaceState,
} from "./uploadSurfaceStateHelpers.ts";
import {
  expectSurfaceControlsUnclipped,
  expectSurfaceContrast,
  expectContextControlContrast,
  scrollSurfaceStateForInspection,
  scrollSurfaceControlByWheel,
} from "./uploadSurfaceLayoutHelpers.ts";
import { expect, type Page } from "@playwright/test";
import { renameSync } from "node:fs";
import { join } from "node:path";
import {
  test,
  pickFilesInUploadSurface,
  readSurfaceSession,
} from "./uploadSurfaceTestHelpers.ts";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixtures/makeUploadSurfaceFixtures.ts";

test("surface 8 offers optional date correction for a real fallback capture day", async ({
  uploaderPage: page,
}, testInfo) => {
  const directory = testInfo.outputPath("undated");
  const paths = makeUploadSurfaceFixturePaths({ directory, count: 3 });
  const unknownPath = join(directory, "unknown-capture.jpg");
  renameSync(paths[2]!, unknownPath);
  await pickFilesInUploadSurface({ page, paths: [unknownPath] });
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
  const detail = await readSurfaceSession({ request: page.request });
  expect(detail.undated?.fileCount).toBe(1);
  expect(detail.files[0]!.capturedOn).not.toBeNull();
  await expect(
    page.getByRole("textbox", { name: "Capture date", exact: true }),
  ).toBeVisible();
});

["light", "dark"].forEach((scheme) => {
  [1280, 768, 400, 640].forEach((width) => {
    test(`surface 8 ready images survive tick, scroll away and reentry at ${width}px in ${scheme}`, async ({
      uploaderPage: page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width === 640 ? 450 : 900 });
      await page.emulateMedia({
        colorScheme: scheme as "light" | "dark",
        reducedMotion: "reduce",
      });
      const paths = makeUploadSurfaceFixturePaths({
        directory: testInfo.outputPath("previews"),
        count: 20,
      });
      await pickFilesInUploadSurface({ page, paths });
      await expect(
        page.getByRole("button", { name: "Put 20 up", exact: true }),
      ).toBeEnabled();
      await _expectReadyPrintReentry(page);
      await expectSurfaceControlsUnclipped(page);
      await expectSurfaceContrast(page);
      await page.screenshot({
        path: `.playwright-mcp/upload-product-ready-${width}-${scheme}-${testInfo.project.name}.png`,
        fullPage: true,
      });
      await page.screenshot({
        path: `.playwright-mcp/upload-product-ready-${width}-${scheme}-${testInfo.project.name}-viewport.png`,
        fullPage: false,
      });
    });
  });
});

["light", "dark"].forEach((scheme) => {
  [1280, 768, 400].forEach((width) => {
    test(`surface 8 controlled API visual state matrix at ${width}px in ${scheme}`, async ({
      uploaderContext,
    }, testInfo) => {
      test.setTimeout(240_000);
      await SURFACE_STATES.reduce(async (previousState, state) => {
        await previousState;
        const page = await uploaderContext.newPage();
        page.setDefaultTimeout(15_000);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          colorScheme: scheme as "light" | "dark",
          reducedMotion: "reduce",
        });
        await prepareSurfaceState({
          page,
          state,
          directory: testInfo.outputPath(`sending-${state}`),
        });
        await expectSurfaceControlsUnclipped(page);
        await expectSurfaceContrast(page);
        await expectContextControlContrast(page, state);
        await page.evaluate(() => {
          return window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: `.playwright-mcp/upload-product-${state}-${width}-${scheme === "light" ? "day" : "night"}-${testInfo.project.name}.png`,
          fullPage: true,
        });
        await scrollSurfaceStateForInspection(page, state);
        await page.screenshot({
          path: `.playwright-mcp/upload-product-${state}-${width}-${scheme === "light" ? "day" : "night"}-${testInfo.project.name}-viewport.png`,
          fullPage: false,
        });
        await page.close();
      }, Promise.resolve());
    });
  });
});

async function _expectReadyPrintReentry(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Put it all up.", exact: true }),
  ).toBeFocused();
  const image = page.getByRole("img", {
    name: /portrait-orientation-6-0.jpg/,
    exact: true,
  });
  await scrollSurfaceControlByWheel(
    page,
    page.getByRole("button", { name: /portrait-orientation-6-0.jpg/ }),
    450,
  );
  await expect(image).toBeVisible({ timeout: 30_000 });
  const geometry = await image.evaluate((element) => {
    return {
      width: (element as HTMLImageElement).naturalWidth,
      height: (element as HTMLImageElement).naturalHeight,
    };
  });
  expect(geometry.height).toBeGreaterThan(geometry.width);
  await image.locator("..").click();
  await expect(image).toBeVisible();
  await expect(image.locator("..")).toHaveAttribute("aria-pressed", "true");
  await scrollSurfaceControlByWheel(
    page,
    page.getByRole("button", { name: "Put 20 up", exact: true }),
    600,
  );
  await expect(image).not.toBeInViewport();
  await scrollSurfaceControlByWheel(
    page,
    page.getByRole("button", { name: /portrait-orientation-6-0.jpg/ }),
    -450,
  );
  await expect(image).toBeVisible({ timeout: 30_000 });
}
