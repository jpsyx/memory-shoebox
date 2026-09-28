import type { CSSVariablesResolver } from "@mantine/core";

/**
 * Mantine's own palette variables, expressed in this world's four inks. Every
 * entry is repeated into `light` and `dark` because Mantine's colour-scheme
 * blocks out-specify its shared block, and a rendition is not a colour scheme:
 * two of the four are dark panels and Mantine never learns which.
 */
const PALETTE: Record<string, string> = {
  "--mantine-color-body": "var(--panel)",
  "--mantine-color-text": "var(--on-panel)",
  "--mantine-color-dimmed": "var(--on-panel-quiet)",
  "--mantine-color-white": "var(--print)",
  "--mantine-color-black": "var(--ink)",
  "--mantine-color-default": "var(--print)",
  "--mantine-color-default-hover": "var(--print-sunk)",
  "--mantine-color-default-color": "var(--on-print)",
  "--mantine-color-default-border": "var(--rule-strong)",
  "--mantine-color-placeholder": "var(--on-print-quiet)",
  "--mantine-color-anchor": "inherit",
  "--mantine-color-error": "var(--on-print)",
  "--mantine-color-disabled": "var(--print-sunk)",
  "--mantine-color-disabled-color": "var(--on-print-quiet)",
  "--mantine-color-disabled-border": "var(--rule-strong)",
  "--mantine-primary-color-filled": "var(--ink-dark)",
  "--mantine-primary-color-filled-hover":
    "color-mix(in oklab, var(--ink-dark) 82%, var(--print))",
  "--mantine-primary-color-contrast": "var(--print)",
  "--mantine-primary-color-light":
    "color-mix(in oklab, var(--ink) 10%, transparent)",
  "--mantine-primary-color-light-hover":
    "color-mix(in oklab, var(--ink) 16%, transparent)",
  "--mantine-primary-color-light-color": "var(--on-panel)",
};

/**
 * Bridges the tokens in `src/styles/tokens/tokens.css` onto Mantine's
 * variables.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => {
  return {
    variables: PALETTE,
    light: PALETTE,
    dark: PALETTE,
  };
};
