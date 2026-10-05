import { EMAIL_THEME } from "./emailTheme.ts";

/**
 * Explicit paragraph size prevents react-email defaults shrinking ordinary
 * copy.
 */
export const EMAIL_PARAGRAPH_STYLE = {
  fontSize: "16px",
  lineHeight: "24px",
  margin: "16px 0 0",
} as const;
/**
 * The drawn high-contrast action remains readable without a mail client's
 * default link colour.
 */
export const EMAIL_ACTION_STYLE = {
  display: "inline-block",
  margin: "20px 0 0",
  padding: "12px 20px",
  border: `1px solid ${EMAIL_THEME.ink}`,
  backgroundColor: EMAIL_THEME.ink,
  color: EMAIL_THEME.paper,
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
} as const;
