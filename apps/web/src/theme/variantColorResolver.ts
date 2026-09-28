import type { VariantColorsResolver } from "@mantine/core";

/**
 * Button and ActionIcon variants, written out rather than computed. Mantine's
 * default resolver lightens and darkens hex values, which cannot work when
 * every colour is a `color-mix` behind a custom property.
 *
 * - `filled` is the primary: solid ink with print text, on a print.
 * - `default` and `outline` are the quiet button, for use on a print.
 * - `panel` is the quiet button when it sits on the enamel instead.
 * - `panel-filled` is the primary when it sits on the enamel instead.
 * - `subtle` carries no stroke at all.
 */
export const variantColorResolver: VariantColorsResolver = ({ variant }) => {
  if (variant === "panel-filled") {
    // The primary, on the enamel rather than on a print.
    //
    // `filled` grounds itself in `ink-dark`, which `DESIGN.md` defines as the
    // dark a white print still needs. On a dark rendition that is the panel's
    // own colour, so a filled button on the panel is the panel: the top bar's
    // Add disappeared in Night. This is § The Selection Bar's rule, solid
    // `on-panel` with `panel` text, which exists for the same reason.
    return {
      background: "var(--on-panel)",
      hover: "color-mix(in oklab, var(--on-panel) 82%, var(--panel))",
      color: "var(--panel)",
      border: "1px solid var(--on-panel)",
    };
  }

  if (variant === "panel") {
    return {
      background: "transparent",
      hover: "color-mix(in oklab, var(--on-panel) 12%, transparent)",
      color: "var(--on-panel)",
      border: "1px solid var(--on-panel)",
    };
  }

  if (variant === "subtle") {
    return {
      background: "transparent",
      hover: "color-mix(in oklab, var(--on-panel) 10%, transparent)",
      color: "var(--on-panel)",
      border: "1px solid transparent",
    };
  }

  if (variant === "default" || variant === "outline") {
    return {
      background: "transparent",
      hover: "color-mix(in oklab, var(--on-print) 8%, transparent)",
      color: "var(--on-print)",
      border: "1px solid var(--rule-strong)",
    };
  }

  if (variant === "danger") {
    // Not a hue. A destructive button earns its weight from a 2px stroke and
    // bold type, so it survives anyone who cannot separate red from ink.
    return {
      background: "transparent",
      hover: "color-mix(in oklab, var(--on-print) 10%, transparent)",
      color: "var(--on-print)",
      border: "2px solid var(--on-print)",
    };
  }

  return {
    background: "var(--ink-dark)",
    hover: "color-mix(in oklab, var(--ink-dark) 82%, var(--print))",
    color: "var(--print)",
    border: "1px solid var(--ink-dark)",
  };
};
