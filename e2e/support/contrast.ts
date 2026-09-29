import type { Page } from "@playwright/test";

/**
 * Text contrast, measured in the browser that painted it.
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
 */

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
  /** Resolved to sRGB. The computed value is a `color-mix` and unreadable. */
  color: string;
  /** The nearest opaque background behind it, resolved the same way. */
  background: string;
  ratio: number;
  /** Which of the two AA thresholds applied, and therefore what it missed. */
  required: number;
};

/**
 * Runs the sweep in the page and hands back only the failures.
 *
 * Every element carrying its own text is measured against the nearest opaque
 * background behind it, which is what somebody actually sees: the sheets in
 * this design sit on the panel and neither one is transparent, so walking
 * ancestors until a background stops being see-through is the honest answer
 * and reading `body` would be the wrong one.
 *
 * Colours are resolved through a 1x1 canvas rather than parsed. The computed
 * value of nearly everything here is an `oklab(...)` or `color(srgb ...)`
 * string that a regular expression can only get wrong, and the canvas is the
 * one thing in a browser that turns any valid colour into sRGB bytes.
 *
 * @param page A page that has finished rendering whatever is being checked.
 * @returns Every element under AA. Empty means the view passes.
 */
export function getContrastFailuresFromPage(
  page: Page,
): Promise<ContrastFailure[]> {
  return page.evaluate(
    ({ bodyThreshold, largeThreshold }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) {
        throw new Error(
          "This browser gave no 2d canvas to resolve colours in.",
        );
      }

      /** Any colour string, as sRGB channels plus alpha. */
      const getChannelsFromColor = (
        value: string,
      ): { red: number; green: number; blue: number; alpha: number } => {
        context.clearRect(0, 0, 1, 1);
        // Painted twice: an unparseable value leaves `fillStyle` at whatever
        // it was, so seeding it with a known colour would hide the failure
        // rather than showing it. Clearing first means an ignored value reads
        // as fully transparent, which is treated as "not a background".
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const data = context.getImageData(0, 0, 1, 1).data;
        return {
          red: data[0] ?? 0,
          green: data[1] ?? 0,
          blue: data[2] ?? 0,
          alpha: (data[3] ?? 0) / 255,
        };
      };

      /** Relative luminance, per WCAG 2.1. */
      const getLuminanceFromChannels = (channels: {
        red: number;
        green: number;
        blue: number;
      }): number => {
        const linear = (channel: number): number => {
          const scaled = channel / 255;
          return scaled <= 0.03928
            ? scaled / 12.92
            : ((scaled + 0.055) / 1.055) ** 2.4;
        };
        return (
          0.2126 * linear(channels.red) +
          0.7152 * linear(channels.green) +
          0.0722 * linear(channels.blue)
        );
      };

      /** The nearest ancestor background that is not see-through. */
      const getBackgroundChannelsFromElement = (element: Element) => {
        let ancestor: Element | null = element;
        while (ancestor !== null) {
          const channels = getChannelsFromColor(
            getComputedStyle(ancestor).backgroundColor,
          );
          if (channels.alpha > 0.5) {
            return channels;
          }
          ancestor = ancestor.parentElement;
        }
        // Nothing opaque anywhere up the tree, which cannot happen while
        // `global.css` gives `body` a background. White is the browser's own
        // answer and the conservative one: it makes pale text fail rather
        // than quietly pass against an invented dark backdrop.
        return { red: 255, green: 255, blue: 255, alpha: 1 };
      };

      /** A short path, for an element whose own words do not identify it. */
      const getSelectorFromElement = (element: Element): string => {
        const parts: string[] = [];
        let ancestor: Element | null = element;
        while (ancestor !== null && parts.length < 4) {
          const id = ancestor.id === "" ? "" : `#${ancestor.id}`;
          parts.unshift(`${ancestor.tagName.toLowerCase()}${id}`);
          ancestor = ancestor.parentElement;
        }
        return parts.join(" > ");
      };

      /**
       * Whether this is one of the announced-but-unseen elements.
       *
       * A visually hidden label is read aloud and never painted, so measuring
       * its contrast is measuring nothing. Both of the shapes Mantine and this
       * design system use to hide one are recognised, and so is anything with
       * no box at all.
       */
      const isInvisible = (element: Element): boolean => {
        const box = element.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) {
          return true;
        }
        const style = getComputedStyle(element);
        return (
          style.visibility === "hidden" ||
          style.opacity === "0" ||
          style.clipPath === "inset(50%)" ||
          style.clip === "rect(0px, 0px, 0px, 0px)"
        );
      };

      const failures = [];
      for (const element of document.querySelectorAll("body *")) {
        const hasOwnText = [...element.childNodes].some((node) => {
          return (
            node.nodeType === Node.TEXT_NODE &&
            (node.textContent ?? "").trim() !== ""
          );
        });
        if (!hasOwnText || isInvisible(element)) {
          continue;
        }

        const style = getComputedStyle(element);
        const fontSizePx = parseFloat(style.fontSize);
        const isLarge =
          fontSizePx >= 24 ||
          (fontSizePx >= 18.66 && Number(style.fontWeight) >= 700);
        const required = isLarge ? largeThreshold : bodyThreshold;

        const foreground = getChannelsFromColor(style.color);
        const background = getBackgroundChannelsFromElement(element);
        const foregroundLuminance = getLuminanceFromChannels(foreground);
        const backgroundLuminance = getLuminanceFromChannels(background);
        const lighter = Math.max(foregroundLuminance, backgroundLuminance);
        const darker = Math.min(foregroundLuminance, backgroundLuminance);
        const ratio =
          Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;

        if (ratio < required) {
          const asRgb = (channels: {
            red: number;
            green: number;
            blue: number;
          }): string => {
            return `rgb(${channels.red}, ${channels.green}, ${channels.blue})`;
          };
          failures.push({
            text: (element.textContent ?? "").trim().slice(0, 60),
            selector: getSelectorFromElement(element),
            fontSizePx: Math.round(fontSizePx * 100) / 100,
            fontWeight: style.fontWeight,
            color: asRgb(foreground),
            background: asRgb(background),
            ratio,
            required,
          });
        }
      }
      return failures;
    },
    { bodyThreshold: AA_BODY_TEXT, largeThreshold: AA_LARGE_TEXT },
  );
}

/**
 * The failures, as something somebody can act on from CI output alone.
 *
 * **A bare "contrast failed" would make this test worse than no test**: the
 * run that catches a regression is usually not the run somebody is watching,
 * and a reader who has to reproduce it locally before they know what broke
 * will disable it instead. So every line carries the words on screen, the two
 * colours as painted, the ratio, and what it needed.
 *
 * @param options.where Which view was swept, in the words the spec uses.
 * @param options.failures What the sweep found, which must not be empty.
 * @returns The message to fail with.
 */
export function makeReportFromContrastFailures(options: {
  where: string;
  failures: readonly ContrastFailure[];
}): string {
  const { where, failures } = options;
  const lines = failures.map((failure) => {
    return (
      `  ${failure.ratio}:1 needs ${failure.required}:1 ` +
      `(${failure.fontSizePx}px, weight ${failure.fontWeight})\n` +
      `    ${failure.color} on ${failure.background}\n` +
      `    "${failure.text}"\n` +
      `    ${failure.selector}`
    );
  });
  return (
    `${failures.length} element${failures.length === 1 ? "" : "s"} ` +
    `below WCAG AA on ${where}:\n${lines.join("\n")}`
  );
}
