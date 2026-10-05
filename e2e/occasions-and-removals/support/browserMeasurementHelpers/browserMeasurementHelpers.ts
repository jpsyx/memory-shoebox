import type { Locator, Page } from "@playwright/test";
import type {
  ControlMetrics,
  DocumentMetrics,
} from "./browserMeasurementHelpers.types.ts";
/** Reads document bounds and rendition after all requested fonts load. */
export async function getDocumentMetricsFromPage(
  page: Readonly<Page>,
): Promise<DocumentMetrics> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.dataset.rendition = matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches
      ? "night"
      : "day";
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      rendition: document.documentElement.dataset.rendition,
    };
  });
}
/** Reads a control's colors and bounds without changing focus. */
export async function getControlMetricsFromLocator(
  control: Readonly<Locator>,
): Promise<ControlMetrics> {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      foreground: style.color,
      background: style.backgroundColor,
      outline: style.outline,
      left: bounds.left,
      right: bounds.right,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}
/** Reads independent computed font sizes for every matched description. */
export async function getFontSizesFromLocators(
  descriptions: Readonly<Locator>,
): Promise<number[]> {
  return Promise.all(
    (await descriptions.all()).map((description) => {
      return description.evaluate((element) => {
        return parseFloat(getComputedStyle(element).fontSize);
      });
    }),
  );
}
/** Reads the first image's loaded width without forcing image completion. */
export async function getImageWidthFromPage(
  page: Readonly<Page>,
): Promise<number> {
  return page
    .locator("img")
    .first()
    .evaluate((image: HTMLImageElement) => {
      return image.naturalWidth;
    });
}
