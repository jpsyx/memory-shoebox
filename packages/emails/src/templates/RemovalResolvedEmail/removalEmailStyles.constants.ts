import type { CSSProperties } from "react";
import { EMAIL_THEME } from "../../lib/emailTheme.ts";

/** Literal mail-client styles shared by the five removal bodies. */
export const REMOVAL_EMAIL_STYLES: Record<
  "heading" | "paragraph" | "quote" | "action",
  CSSProperties
> = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1.2",
    margin: "24px 0 0",
  },
  paragraph: { margin: "16px 0 0" },
  quote: {
    borderLeft: `2px solid ${EMAIL_THEME.ink}`,
    fontStyle: "italic",
    margin: "16px 0 0",
    padding: "0 0 0 16px",
    whiteSpace: "pre-wrap",
  },
  action: {
    display: "inline-block",
    margin: "20px 0 0",
    textDecoration: "underline",
  },
};
