import type { Page, TestInfo } from "@playwright/test";
import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "./setup.fixtures.ts";
import { createSetup } from "./setupActionHelpers.ts";
import { getContrastFailuresFromPage } from "../../support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
  { name: "zoom-layout-equivalent", width: 640, height: 450 },
] as const;

type SetupCaptureOptions = {
  page: Page;
  testInfo: TestInfo;
  viewport: (typeof VIEWPORTS)[number];
  scheme: "light" | "dark";
  stage: "creation" | "invitations";
};

async function _captureSetupStage(
  options: Readonly<SetupCaptureOptions>,
): Promise<void> {
  const { page, testInfo, viewport, scheme, stage } = options;
  if (
    process.env.SETUP_CAPTURE === "1" &&
    testInfo.project.name === "setup-chrome"
  ) {
    const filename = `${viewport.name}-${viewport.width}x${viewport.height}-${scheme}-${stage}.png`;
    const originals = "test-results/setup-review";
    const packet = ".impeccable/review/setup";
    await mkdir(originals, { recursive: true });
    await mkdir(packet, { recursive: true });
    await page.evaluate(() => {
      return window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: join(originals, filename),
      fullPage: true,
    });
    await copyFile(join(originals, filename), join(packet, filename));
  }
}

VIEWPORTS.forEach((viewport) => {
  (["light", "dark"] as const).forEach((scheme) => {
    test(`${viewport.name} ${scheme} fits setup and invitation controls with AA text`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/setup");
      for (const stage of ["creation", "invitations"] as const) {
        if (stage === "invitations") {
          await createSetup(page);
        }
        const action = page.getByRole("button", {
          name: stage === "creation" ? "Review your email" : "Skip for now",
          exact: true,
        });
        await expect(action).toBeVisible();
        expect(
          await page.evaluate(() => {
            return (
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
            );
          }),
        ).toBeLessThanOrEqual(0);
        await action.scrollIntoViewIfNeeded();
        const bounds = await action.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds?.x).toBeGreaterThanOrEqual(0);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
          viewport.width,
        );
        expect(await getContrastFailuresFromPage(page)).toEqual([]);
        await _captureSetupStage({ page, testInfo, viewport, scheme, stage });
      }
    });
  });
});
