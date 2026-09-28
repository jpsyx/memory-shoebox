import { render } from "@react-email/render";
import type { RenderedEmail } from "../emailTemplate.types.ts";
import type { ReactElement } from "react";

/**
 * Columns the plain-text alternative wraps at.
 *
 * 58 rather than a rounder number because it is the width the mockups in
 * `prototypes/src/surfaces/Emails.tsx` were written at: at 58 the sign-in
 * code's two wrapped sentences break exactly where the prototype breaks them.
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
