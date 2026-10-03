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
 * Every element carrying its own text is measured against everything behind
 * it, which is what somebody actually sees: the sheets in this design sit on
 * the panel, so walking ancestors and compositing each one's background in
 * turn is the honest answer and reading `body` would be the wrong one. A
 * positioned sibling painted beneath one of those ancestors, with a z-index
 * of 0 or more and a box holding the whole of the text's, is behind the text
 * too, which is how a segmented control draws its chosen segment, so it is
 * composited in its place in the walk.
 *
 * Both sides are composited rather than read off, because neither `color` nor
 * `background-color` is what lands on the screen. Each is blended by its own
 * alpha, and by the product of every `opacity` between it and the root, since
 * `opacity` fades a whole subtree and is the usual way a hint or a disabled
 * control is dimmed. Reading either at full strength would report a ratio
 * nobody can see.
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

      /** One colour laid over another at a given alpha, in sRGB as CSS does it. */
      const blendChannels = (
        over: { red: number; green: number; blue: number },
        under: { red: number; green: number; blue: number },
        alpha: number,
      ): { red: number; green: number; blue: number } => {
        const mix = (top: number, bottom: number): number => {
          return Math.round(top * alpha + bottom * (1 - alpha));
        };
        return {
          red: mix(over.red, under.red),
          green: mix(over.green, under.green),
          blue: mix(over.blue, under.blue),
        };
      };

      /** The root, then every element down to and including this one. */
      const getAncestryFromElement = (element: Element): Element[] => {
        const ancestry: Element[] = [];
        let ancestor: Element | null = element;
        while (ancestor !== null) {
          ancestry.unshift(ancestor);
          ancestor = ancestor.parentElement;
        }
        return ancestry;
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

      /** A z-index as a number, `auto` reading as the zero it paints at. */
      const getZIndexFromElement = (element: Element): number => {
        const zIndex = Number.parseInt(getComputedStyle(element).zIndex, 10);
        return Number.isNaN(zIndex) ? 0 : zIndex;
      };

      /** Whether `outer` contains the whole of `inner`, edges included. */
      const isBoxInside = (options: {
        inner: DOMRect;
        outer: DOMRect;
      }): boolean => {
        const { inner, outer } = options;
        return (
          inner.left >= outer.left &&
          inner.right <= outer.right &&
          inner.top >= outer.top &&
          inner.bottom <= outer.bottom
        );
      };

      /**
       * The absolutely positioned siblings of `layer` that paint beneath it
       * and hold the whole of `target`'s box, in the order they are painted.
       *
       * A layer behind the text is not always one of its ancestors. A
       * segmented control draws its chosen segment as an indicator that
       * slides between the labels, positioned under the label rather than
       * around it, so the label's ink is meant to be read against the
       * indicator and an ancestor walk alone measures it against the track.
       *
       * **Every rule here leans towards leaving a layer out**, because a
       * layer left out can only cost a false failure, while a layer wrongly
       * counted can pass words nobody can read:
       *
       * - Beneath means a positioned `layer` and a z-index of 0 or more that
       *   is lower than its own, or the same one earlier in the document. A
       *   negative z-index paints under the backgrounds of every ancestor up
       *   to its stacking context, the shared parent's included, so it may
       *   not be backing the text at all, and it is never counted.
       * - The layer's box must hold the text's whole box. One behind only the
       *   middle of a long label leaves both ends on whatever is under it.
       * - A sibling painted above `layer` covers the text rather than backing
       *   it, so it is not a background either.
       */
      const getUnderlaysFromLayer = (options: {
        layer: Element;
        target: Element;
      }): Element[] => {
        const { layer, target } = options;
        if (getComputedStyle(layer).position === "static") {
          return [];
        }
        const siblings = [...(layer.parentElement?.children ?? [])];
        const targetBox = target.getBoundingClientRect();
        const layerIndex = siblings.indexOf(layer);
        const layerZIndex = getZIndexFromElement(layer);
        return siblings
          .filter((sibling, siblingIndex) => {
            const position = getComputedStyle(sibling).position;
            if (
              sibling === layer ||
              (position !== "absolute" && position !== "fixed") ||
              isInvisible(sibling)
            ) {
              return false;
            }
            const siblingZIndex = getZIndexFromElement(sibling);
            const isBeneath =
              siblingZIndex >= 0 &&
              (siblingZIndex < layerZIndex ||
                (siblingZIndex === layerZIndex && siblingIndex < layerIndex));
            return (
              isBeneath &&
              isBoxInside({
                inner: targetBox,
                outer: sibling.getBoundingClientRect(),
              })
            );
          })
          .sort((first, second) => {
            return (
              getZIndexFromElement(first) - getZIndexFromElement(second) ||
              siblings.indexOf(first) - siblings.indexOf(second)
            );
          });
      };

      /**
       * Everything behind this element's own text, flattened to one opaque
       * colour, plus the opacity its text is painted at.
       *
       * The walk is root-first, because that is the order the browser paints
       * in: each ancestor's background goes over what is already there, at its
       * own alpha times every `opacity` from the root down to it, and the
       * element's own background is the last layer before its text. The same
       * running product is what the text is then faded by, which is why it is
       * returned rather than computed again.
       *
       * Before each ancestor's own background go the positioned siblings
       * painted beneath it (`getUnderlaysFromLayer`), at their own alpha times
       * their own `opacity` and every `opacity` above them.
       */
      const getBackdropFromElement = (
        element: Element,
      ): {
        channels: { red: number; green: number; blue: number };
        opacity: number;
      } => {
        // White is the browser's own backdrop and the conservative choice: it
        // makes pale text fail rather than quietly pass against an invented
        // dark one. Nothing reaches it while `global.css` gives `body` a
        // background, but a transparent tree would otherwise measure nothing.
        let channels = { red: 255, green: 255, blue: 255 };
        let opacity = 1;
        for (const ancestor of getAncestryFromElement(element)) {
          channels = getUnderlaysFromLayer({
            layer: ancestor,
            target: element,
          }).reduce((blended, underlay) => {
            const underlayStyle = getComputedStyle(underlay);
            const underlayOpacity = Number.parseFloat(underlayStyle.opacity);
            const underlayLayer = getChannelsFromColor(
              underlayStyle.backgroundColor,
            );
            return blendChannels(
              underlayLayer,
              blended,
              underlayLayer.alpha *
                opacity *
                (Number.isNaN(underlayOpacity) ? 1 : underlayOpacity),
            );
          }, channels);
          const style = getComputedStyle(ancestor);
          const own = Number.parseFloat(style.opacity);
          opacity *= Number.isNaN(own) ? 1 : own;
          const layer = getChannelsFromColor(style.backgroundColor);
          channels = blendChannels(layer, channels, layer.alpha * opacity);
        }
        return { channels, opacity };
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

        const backdrop = getBackdropFromElement(element);
        // Faded to nothing by an ancestor, which is another way of being
        // hidden: there is no contrast to measure and no reader to fail.
        if (backdrop.opacity === 0) {
          continue;
        }
        const ink = getChannelsFromColor(style.color);
        const background = backdrop.channels;
        const foreground = blendChannels(
          ink,
          background,
          ink.alpha * backdrop.opacity,
        );
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
