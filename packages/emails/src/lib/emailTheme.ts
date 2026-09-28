/**
 * Literal values, because a mail client resolves nothing.
 *
 * Every colour here is a hex string and the font stack names fonts a client
 * already has. A custom property, a webfont or a `color-mix` would be dropped
 * by the renderer and take the design with it.
 */
export const EMAIL_THEME = {
  ink: "#1b1f22",
  quietInk: "#4a4a4a",
  paper: "#ffffff",
  rule: "#cccccc",
  fontFamily: "Arial,Helvetica,sans-serif",
  /** The column the mockups were drawn at. */
  columnWidth: "600px",
} as const;

/**
 * Where an AGPL-licensed instance offers its source.
 *
 * The footer's offer is a licence obligation as much as a courtesy, so it is
 * in every message rather than configurable per deployment.
 */
export const SOURCE_URL = "https://github.com/jpsyx/memory-shoebox";
