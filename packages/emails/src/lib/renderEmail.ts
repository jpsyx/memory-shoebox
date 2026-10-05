import { render } from "@react-email/render";
import type { RenderedEmail } from "../emailTemplate.types.ts";
import type { ReactElement } from "react";

/**
 * Columns the plain-text alternative wraps at.
 *
 * The 58-column width keeps the sign-in code sentences at their intended
 * plain-text line breaks.
 */
const PLAIN_TEXT_COLUMNS = 58;

/**
 * Renders one message into the two forms a mail client picks from.
 *
 * Every template goes through here rather than calling `render` twice itself,
 * because the plain-text options are the easy thing to forget and forgetting
 * them is invisible: `html-to-text` does no wrapping at all by default, and a
 * message that comes out as four unbroken paragraphs still passes every
 * assertion anybody writes about its words. One call site is what keeps the
 * seven templates from drifting apart, which is the drift this package was
 * built to end rather than relocate.
 */
export async function renderEmail(
  element: ReactElement,
): Promise<RenderedEmail> {
  return {
    html: await render(element),
    text: await render(element, {
      plainText: true,
      htmlToTextOptions: { wordwrap: PLAIN_TEXT_COLUMNS },
    }),
  };
}
