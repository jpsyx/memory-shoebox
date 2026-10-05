import {
  EMAIL_PARAGRAPH_STYLE,
  EMAIL_ACTION_STYLE,
} from "./emailReadingStyles.constants.ts";
import type { CSSProperties } from "react";
import { EMAIL_THEME } from "./emailTheme.ts";

/** Literal mail-client styles shared by the five removal bodies. */
export const REMOVAL_EMAIL_STYLES = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1.2",
    margin: "24px 0 0",
  },
  paragraph: EMAIL_PARAGRAPH_STYLE,
  quote: {
    fontSize: "16px",
    lineHeight: "24px",
    borderLeft: `2px solid ${EMAIL_THEME.ink}`,
    fontStyle: "italic",
    margin: "16px 0 0",
    padding: "0 0 0 16px",
    whiteSpace: "pre-wrap",
  },
  action: EMAIL_ACTION_STYLE,
} as const satisfies Record<
  "heading" | "paragraph" | "quote" | "action",
  CSSProperties
>;
