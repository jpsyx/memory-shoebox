import { writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect } from "./media.fixtures.ts";
import type { MediaAcceptanceCatalog } from "../support/createMediaAcceptanceCatalog.ts";

type PlaceholderBox = {
  width: number;
  height: number;
  parentWidth: number;
  parentHeight: number;
  rem: number;
};

async function _getPlaceholderBoxFromLocator(
  placeholder: Locator,
): Promise<PlaceholderBox> {
  await expect(placeholder).toBeVisible();
  return placeholder.evaluate(async (element) => {
    await document.fonts.ready;
    const box = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      parentWidth: parent.width,
      parentHeight: parent.height,
      rem: Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      ),
    };
  });
}

async function _setMissingPreviews(options: {
  catalog: MediaAcceptanceCatalog;
  itemIds: readonly string[];
  width: number;
  height: number;
}): Promise<void> {
  await options.catalog.database
    .updateTable("items")
    .set({ width: options.width, height: options.height })
    .where("id", "in", [...options.itemIds])
    .execute();
  await options.catalog.database
    .deleteFrom("item_renditions")
    .where("item_id", "in", [...options.itemIds])
    .execute();
}

async function _checkSelectedAndStrip(options: {
  page: Page;
  itemId: string;
  width: number;
  height: number;
  testInfo: TestInfo;
  shape: string;
}): Promise<Record<string, PlaceholderBox>> {
  const { page, itemId, width, height, testInfo, shape } = options;
  await page.goto(`/items/${itemId}`);
  const viewer = page.locator('[data-photo-surface="viewer"] [role="img"]');
  const viewerBox = await _getPlaceholderBoxFromLocator(viewer);
  expect
    .soft(viewerBox.height, `${shape} viewer fits the 70vh media cap`)
    .toBeLessThanOrEqual(page.viewportSize()!.height * 0.7 + 1);
  expect
    .soft(
      viewerBox.width / viewerBox.height,
      `${shape} viewer preserves oriented ratio`,
    )
    .toBeCloseTo(width / height, 2);
  const sibling = page
    .getByRole("link", { name: "Photo 1 of 5", exact: true })
    .getByRole("img");
  const siblingBox = await _getPlaceholderBoxFromLocator(sibling);
  const siblingLabel = await _getPlaceholderBoxFromLocator(
    sibling.getByText("Unavailable", { exact: true }),
  );
  expect
    .soft(siblingLabel.width, "compact strip status fits horizontally")
    .toBeLessThanOrEqual(siblingLabel.parentWidth + 1);
  expect
    .soft(siblingLabel.height, "compact strip status fits vertically")
    .toBeLessThanOrEqual(siblingLabel.parentHeight + 1);
  expect
    .soft(siblingBox.width, `${shape} strip fits its fixed frame width`)
    .toBeLessThanOrEqual(siblingBox.parentWidth - 6 + 1);
  expect
    .soft(siblingBox.height, `${shape} strip fits its fixed frame height`)
    .toBeLessThanOrEqual(siblingBox.parentHeight - 6 + 1);
  if (shape === "portrait")
    await page.screenshot({
      path: testInfo.outputPath("viewer-and-strip.png"),
    });
  return { viewer: viewerBox, sibling: siblingBox, siblingLabel };
}

async function _checkCompactPreviews(options: {
  page: Page;
  itemId: string;
  testInfo: TestInfo;
  shape: string;
}): Promise<Record<string, PlaceholderBox>> {
  const { page, itemId, testInfo, shape } = options;
  await page
    .getByRole("button", { name: "More photo details", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Who opened this", exact: true })
    .click();
  const presenceBox = await _getPlaceholderBoxFromLocator(
    page
      .getByRole("region", { name: "Who has opened this item", exact: true })
      .getByRole("img", { name: "Measurement memory 4", exact: true }),
  );
  expect
    .soft(
      presenceBox.width,
      `${shape} presence retains its 12rem thumbnail width`,
    )
    .toBeLessThanOrEqual(presenceBox.rem * 12 + 1);
  await page.goto(`/items/${itemId}/removal`);
  const removalBox = await _getPlaceholderBoxFromLocator(
    page.getByRole("img", { name: "Measurement memory 4", exact: true }),
  );
  expect
    .soft(
      removalBox.width,
      `${shape} removal retains its 12rem thumbnail width`,
    )
    .toBeLessThanOrEqual(removalBox.rem * 12 + 1);
  expect
    .soft(removalBox.height, `${shape} removal retains its 10rem media height`)
    .toBeLessThanOrEqual(removalBox.rem * 10 + 1);
  if (shape === "portrait")
    await page.screenshot({ path: testInfo.outputPath("compact-removal.png") });
  return { presence: presenceBox, removal: removalBox };
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`missing previews respect host media bounds at ${viewport.width}px`, async ({
    page,
    catalog,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.request.get("/api/media-evidence/session");
    const itemIds = catalog.itemIds.slice(3, 8);
    const itemId = itemIds[0]!;
    const measurements: Record<string, unknown> = {};
    for (const dimensions of [
      { shape: "portrait", width: 600, height: 800 },
      { shape: "landscape", width: 800, height: 600 },
      { shape: "tall-portrait", width: 100, height: 800 },
    ]) {
      await _setMissingPreviews({ catalog, itemIds, ...dimensions });
      const selected = await _checkSelectedAndStrip({
        page,
        itemId,
        testInfo,
        ...dimensions,
      });
      const compact = await _checkCompactPreviews({
        page,
        itemId,
        testInfo,
        shape: dimensions.shape,
      });
      measurements[dimensions.shape] = { ...selected, ...compact };
    }
    await writeFile(
      testInfo.outputPath("placeholder-layout.json"),
      JSON.stringify(measurements, null, 2),
    );
    await testInfo.attach("placeholder-layout", {
      body: JSON.stringify(measurements, null, 2),
      contentType: "application/json",
    });
  });
}
