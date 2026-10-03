import type { Page } from "@playwright/test";
import { getContrastFailuresFromDocument } from "./getContrastFailuresFromDocument.ts";

/** WCAG 2.1 AA, for text below the large-text threshold. */
export const AA_BODY_TEXT = 4.5;

/** WCAG 2.1 AA, for large text: 24px, or 18.66px at 700 or heavier. */
export const AA_LARGE_TEXT = 3;

/** One element that does not meet AA, with everything needed to fix it. */
export type ContrastFailure = {
  /** The first of the element's own words, so it can be found on screen. */
  text: string;
  /** A CSS-ish path to it, for the case where the words are not enough. */
  selector: string;
  fontSizePx: number;
  fontWeight: string;
  /**
   * The ink as it reached the eye: resolved to sRGB, then composited over the
   * background by its own alpha and by every `opacity` above it. The computed
   * value is a `color-mix` and unreadable, and it is not what was painted.
   */
  color: string;
  /** Everything behind it, composited down to one opaque colour. */
  background: string;
  ratio: number;
  /** Which of the two AA thresholds applied, and therefore what it missed. */
  required: number;
};

/**
 * Runs the sweep in the page and hands back only the failures.
 *
 * **This cannot live in the unit tests and that is the whole reason it is
 * here.** Every colour in this design system is a `color-mix` in oklab of four
 * inks, and jsdom computes neither `color-mix` nor `prefers-color-scheme`, so
 * a Vitest render of the same component reports the unresolved custom property
 * and proves nothing. Only a real browser can say what was actually painted.
 *
 * What it guards is a specific and repeatable mistake: reaching for a token
 * whose name is close enough. A field's description used `--on-panel-quiet`,
 * the quiet ink for text on the panel, while a field always sits on a print
 * sheet. In Day the panel is light and the mix landed dark enough to read, so
 * the error was invisible; in Night the panel is deep blue and the same mix
 * resolved to a mid grey, dropping two hints on My account to 3.06:1. A width
 * check could not see it and neither could a colour check in one scheme.
 *
 * **It measures what reaches the eye, which is not what `color` says.** Two
 * things stand between the two, and both are ordinary CSS this design system
 * could start using tomorrow. A foreground with an alpha below 1 is a blend
 * with whatever is behind it, so `rgba(0, 0, 0, 0.4)` on white is a mid grey
 * and not black. And `opacity` on any ancestor fades everything inside it,
 * which is the usual way a disabled control or a secondary hint is dimmed.
 * Measuring either at full strength reports a ratio nobody can see, passes,
 * and fails on screen, so both are composited before the luminance is taken.
 * Today the theme pins `opacity: 1` on disabled controls and writes no
 * translucent ink, so nothing in the tree exercises either path: this is here
 * for the first line that does.
 *
 * @param page A page that has finished rendering whatever is being checked.
 * @returns Every element under AA. Empty means the view passes.
 */
export function getContrastFailuresFromPage(
  page: Page,
): Promise<ContrastFailure[]> {
  return page.evaluate(getContrastFailuresFromDocument, {
    bodyThreshold: AA_BODY_TEXT,
    largeThreshold: AA_LARGE_TEXT,
  });
}
