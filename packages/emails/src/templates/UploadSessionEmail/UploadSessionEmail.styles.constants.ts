import {
  EMAIL_PARAGRAPH_STYLE,
  EMAIL_ACTION_STYLE,
} from "../../lib/emailReadingStyles.constants.ts";
/** Inline styles shared by the upload email bodies. */
export const UPLOAD_SESSION_STYLES = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1.2",
    margin: "24px 0 0",
  },

  paragraph: EMAIL_PARAGRAPH_STYLE,

  action: EMAIL_ACTION_STYLE,
} as const;
