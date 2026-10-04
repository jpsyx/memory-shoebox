import { expect, type Page, type Locator } from "@playwright/test";
import { test } from "./uploadSurfaceTestHelpers.ts";
import {
  prepareSurfaceState,
  type SurfaceState,
} from "./uploadSurfaceStateHelpers.ts";
import { expectSurfaceControlsUnclipped } from "./uploadSurfaceLayoutHelpers.ts";

const ZOOM_STATES: SurfaceState[] = [
  "tag",
  "person",
  "milestone",
  "milestone-new",
  "milestone-fix",
  "visibility",
  "undated",
  "done",
  "partial",
];

["light", "dark"].forEach((scheme) => {
  test(`surface 8 layout equivalent 200 percent at 640x450 in ${scheme}`, async ({
    uploaderContext,
  }, testInfo) => {
    test.setTimeout(180_000);
    for (const state of ZOOM_STATES) {
      const page = await uploaderContext.newPage();
      page.setDefaultTimeout(15_000);
      await page.setViewportSize({ width: 640, height: 450 });
      await page.emulateMedia({
        colorScheme: scheme as "light" | "dark",
        reducedMotion: "reduce",
      });
      await prepareSurfaceState({
        page,
        state,
        directory: testInfo.outputPath(state),
      });
      await expectSurfaceControlsUnclipped(page);
      await _expectZoomControlsReachable({ page, state });
      await page.screenshot({
        path: `.playwright-mcp/upload-zoom-${state}-${scheme}-${testInfo.project.name}.png`,
      });
      await page.close();
    }
  });
});

["light", "dark"].forEach((scheme) => {
  test(`surface 8 native date rendered contrast in ${scheme}`, async ({
    uploaderPage: page,
  }, testInfo) => {
    await page.setViewportSize({ width: 640, height: 450 });
    await page.emulateMedia({
      colorScheme: scheme as "light" | "dark",
      reducedMotion: "reduce",
    });
    await prepareSurfaceState({
      page,
      state: "undated",
      directory: testInfo.outputPath("date"),
    });
    await _expectNativeDateContrast({
      page,
      scheme,
      project: testInfo.project.name,
    });
  });
});

async function _expectZoomControlsReachable({
  page,
  state,
}: Readonly<{ page: Page; state: SurfaceState }>): Promise<void> {
  const scope = (await page.getByRole("dialog").count())
    ? page.getByRole("dialog")
    : page.getByRole("main");
  const controls = scope.locator(
    "button,input:not([type=hidden]),textarea,select,a",
  );
  for (const control of await controls.all()) {
    if (!(await control.isVisible()) || !(await control.isEnabled())) {
      continue;
    }
    await control.focus();
    await expect(control).toBeFocused();
    await _scrollZoomControlIntoViewport({ page, control });
    await expectSurfaceControlsUnclipped(page);
  }
  if (state === "milestone-new") {
    const blurb = scope.getByRole("textbox", {
      name: "A line about it",
      exact: true,
    });
    await blurb.fill("A line remains editable at 200 percent.");
    await expect(blurb).toHaveValue("A line remains editable at 200 percent.");
  }
}

function _getLuminance(color: readonly number[]): number {
  return color.reduce((total, channel, index) => {
    const value = channel / 255;
    const linear =
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return total + linear * [0.2126, 0.7152, 0.0722][index]!;
  }, 0);
}

async function _getRenderedDateColors({
  page,
  bytes,
  isSelected = false,
}: Readonly<{ page: Page; bytes: Buffer; isSelected?: boolean }>): Promise<{
  background: number[];
  ink: number[];
  samples: number;
}> {
  const histogram = await page.evaluate(_getDateColorHistogram, {
    base64: bytes.toString("base64"),
    isSelected,
  });
  histogram.sort((first, second) => {
    return second[1] - first[1];
  });
  const background = histogram[0]![0].split(",").map(Number);
  const ink = histogram
    .map(([key]) => {
      return key.split(",").map(Number);
    })
    .reduce((highestContrast, candidate) => {
      return _getColorContrast(candidate, background) >
        _getColorContrast(highestContrast, background)
        ? candidate
        : highestContrast;
    }, background);
  return {
    background,
    ink,
    samples: histogram.reduce((total, [, count]) => {
      return total + count;
    }, 0),
  };
}

function _getColorContrast(
  first: readonly number[],
  second: readonly number[],
): number {
  const firstLuminance = _getLuminance(first);
  const secondLuminance = _getLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

async function _expectNativeDateContrast({
  page,
  scheme,
  project,
}: Readonly<{ page: Page; scheme: string; project: string }>): Promise<void> {
  const date = page.getByRole("textbox", {
    name: "Capture date",
    exact: true,
  });
  for (const value of ["", "2026-10-03"]) {
    await expect(date).toBeEnabled();
    await date.fill(value);
    await expect(date).toHaveValue(value);
    await expect(date).toBeFocused();
    await date.click({ position: { x: 50, y: 24 } });
    await _expectDatePartContrast({
      page,
      date,
      scheme,
      project,
      value,
      part: "focused-unselected",
    });
    await _expectDatePartContrast({
      page,
      date,
      scheme,
      project,
      value,
      part: "focused-selected",
    });
    await page
      .getByRole("heading", { name: "Put it all up.", exact: true })
      .click();
    await _expectDatePartContrast({
      page,
      date,
      scheme,
      project,
      value,
      part: "blurred",
    });
  }
}

type DateContrastOptions = {
  page: Page;
  date: Locator;
  scheme: string;
  project: string;
  value: string;
  part: "blurred" | "focused-selected" | "focused-unselected";
};

async function _expectDatePartContrast({
  page,
  date,
  scheme,
  project,
  value,
  part,
}: Readonly<DateContrastOptions>): Promise<void> {
  const bytes = await date.screenshot({
    scale: "css",
    path: `.playwright-mcp/upload-native-date-${part}-${value ? "value" : "placeholder"}-${scheme}-${project}.png`,
  });
  const isSelected = part === "focused-selected";
  const colors = await _getRenderedDateColors({ page, bytes, isSelected });
  const inkLuminance = _getLuminance(colors.ink);
  const backgroundLuminance = _getLuminance(colors.background);
  const ratio =
    (Math.max(inkLuminance, backgroundLuminance) + 0.05) /
    (Math.min(inkLuminance, backgroundLuminance) + 0.05);
  console.info(
    "Native date rendered contrast",
    JSON.stringify({ scheme, value, part, ...colors, ratio }),
  );
  expect
    .soft(ratio, `native date ${value ? "value" : "placeholder"} ${part}`)
    .toBeGreaterThanOrEqual(4.5);
}

async function _getDateColorHistogram({
  base64,
  isSelected,
}: Readonly<{ base64: string; isSelected: boolean }>): Promise<
  Array<[string, number]>
> {
  const bytes = Uint8Array.from(atob(base64), (character) => {
    return character.charCodeAt(0);
  });
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Native date screenshot needs a canvas decoder");
  }
  context.drawImage(bitmap, 0, 0);
  const { data } = isSelected
    ? context.getImageData(42, 14, 20, 20)
    : context.getImageData(12, 8, 20, bitmap.height - 16);
  const histogram = new Map<string, number>();
  for (let offset = 0; offset < data.length; offset += 4) {
    const key = [...data.slice(offset, offset + 3)].join(",");
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  return [...histogram];
}

async function _scrollZoomControlIntoViewport({
  page,
  control,
}: Readonly<{ page: Page; control: Locator }>): Promise<void> {
  await expect
    .poll(async () => {
      const box = await control.boundingBox();
      if (!box) {
        return false;
      }
      const height = page.viewportSize()!.height;
      const isInViewport = box.y >= 0 && box.y + box.height <= height;
      if (!isInViewport) {
        await page.mouse.move(
          Math.max(10, Math.min(630, box.x + box.width / 2)),
          Math.max(10, Math.min(height - 10, box.y + box.height / 2)),
        );
        await page.mouse.wheel(0, box.y < 0 ? -80 : 80);
      }
      return isInViewport;
    })
    .toBe(true);
  await expect(control).toBeFocused();
}
