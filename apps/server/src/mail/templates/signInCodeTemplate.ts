import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";
import {
  escapeHtml,
  renderEmailHtml,
  renderEmailText,
  spellSmallNumber,
  type EmailTemplate,
} from "./layout.ts";

/** "It works for ten minutes and then it stops." */
function _lifetimeSentence(payload: SignInCodeEmailPayload): string {
  return `It works for ${spellSmallNumber(payload.expiresInMinutes)} minutes and then it stops.`;
}

const REASSURANCE =
  "If you did not ask for this, somebody typed your address by mistake. Nothing has happened and you can ignore it.";

/**
 * `sign_in_code`: surface 16, state `code`.
 *
 * **The six digits are in the subject deliberately**, so the code reads off a
 * lock screen without opening anything. That is also why both `payload_json`
 * and `subject` are scrubbed once the row is terminal: the subject column is
 * otherwise a permanent log of live-looking codes sitting beside the address
 * each was sent to (`data-models.md` § `outbound_emails`).
 *
 * The footer carries no preferences link, because a sign-in code is the one
 * message nobody may turn off.
 */
export const signInCodeTemplate: EmailTemplate<SignInCodeEmailPayload> = {
  subject: (payload) => {
    return `Your code is ${payload.code}`;
  },

  html: (payload) => {
    const body = [
      `<h1 style="margin:24px 0 0;font-size:24px;line-height:1.2;font-weight:bold;">Your code</h1>`,
      `<p style="margin:20px 0 0;padding:16px;border:2px solid #1b1f22;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:0.35em;text-align:center;">${escapeHtml(payload.code)}</p>`,
      `<p style="margin:16px 0 0;">Type it into the page you left open. ${_lifetimeSentence(payload)}</p>`,
      `<p style="margin:16px 0 0;">${REASSURANCE}</p>`,
    ].join("");

    return renderEmailHtml({
      shoeboxName: payload.shoeboxName,
      preferencesUrl: payload.preferencesUrl,
      bodyHtml: body,
    });
  },

  text: (payload) => {
    const body = [
      "Your code is",
      "",
      `    ${payload.code}`,
      "",
      `Type it into the page you left open. ${_lifetimeSentence(payload)}`,
      "",
      REASSURANCE,
    ].join("\n");

    return renderEmailText({
      shoeboxName: payload.shoeboxName,
      preferencesUrl: payload.preferencesUrl,
      bodyText: body,
    });
  },
};
