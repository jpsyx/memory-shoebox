import type { EmailCommon } from "@memory-shoebox/shared";

/**
 * Where an AGPL-licensed instance offers its source.
 *
 * The footer's offer is a licence obligation as much as a courtesy, so it is
 * in every message rather than configurable per deployment.
 */
const SOURCE_URL = "https://github.com/jpsyx/memory-shoebox";

/**
 * Columns the plain-text alternative wraps at.
 *
 * 58 rather than a rounder number because it is the width the mockups in
 * `prototypes/src/surfaces/Emails.tsx` were written at: at 58 the sign-in
 * code's two wrapped sentences break exactly where the prototype breaks them,
 * and 58 is the longest plain-text line in any of the twelve states.
 */
const PLAIN_TEXT_COLUMNS = 58;

/**
 * One rendered message, in both forms a mail client may choose between.
 */
export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * One kind's copy.
 *
 * **Takes the payload and nothing else.** That is the mechanical test for
 * whether a payload is right (`apis/notifications.md` § Rules that hold for
 * all nine): if rendering would need a query, the payload is wrong, and a
 * retry a day later would produce a different message from the same row.
 */
export type EmailTemplate<Payload extends EmailCommon> = {
  subject: (payload: Payload) => string;
  html: (payload: Payload) => string;
  text: (payload: Payload) => string;
};

/** Escapes text for an HTML attribute or a text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Spells a small number in English, falling back to digits.
 *
 * The mockup reads "It works for ten minutes", and the payload carries `10` so
 * the copy cannot drift from the row. Hard-coding the word would defeat the
 * field, and printing "10" would not be the copy that was designed, so the
 * number is spelled.
 */
export function spellSmallNumber(value: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  return words[value] ?? String(value);
}

/**
 * Breaks one long line into lines of at most `columns` characters.
 *
 * A word longer than the column width (a URL, most often) is left whole on a
 * line of its own rather than cut, because a broken link is worse than a line
 * that runs past the margin.
 */
function _wrapLine(line: string, columns: number): string {
  return line.split(" ").reduce((wrapped, word) => {
    if (wrapped === "") {
      return word;
    }
    const lastBreakIndex = wrapped.lastIndexOf("\n");
    const currentLength = wrapped.length - lastBreakIndex - 1;
    if (currentLength + 1 + word.length <= columns) {
      return `${wrapped} ${word}`;
    }
    return `${wrapped}\n${word}`;
  }, "");
}

/**
 * Wraps plain text at a width a narrow mail client will not re-wrap badly.
 *
 * A line that is already indented is returned untouched: the four spaces the
 * six digits sit on are the only thing marking them out in a form that has no
 * type sizes, and re-flowing them would lose that.
 */
function _wrapPlainText(
  text: string,
  columns: number = PLAIN_TEXT_COLUMNS,
): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.length <= columns || line.startsWith("    ")) {
        return line;
      }
      return _wrapLine(line, columns);
    })
    .join("\n");
}

/**
 * Wraps a message body in the shared masthead and footer.
 *
 * **Nothing here may reference a design token, a webfont, or a layout that
 * needs a modern renderer.** `prototypes/src/surfaces/Emails.module.css` says
 * so in as many words and gives the reason: a mail client strips webfonts,
 * ignores custom properties, flattens `color-mix`, and may show the plain-text
 * alternative instead of any of it. The thing being designed here is whether
 * it still reads after somebody forwards it to four people.
 *
 * The preferences link is rendered when `preferencesUrl` is set and omitted
 * when it is null, which is `sign_in_code` and only `sign_in_code`: offering
 * to turn off a message that cannot be turned off is a lie.
 */
export function renderEmailHtml(options: {
  shoeboxName: string;
  preferencesUrl: string | null;
  bodyHtml: string;
}): string {
  const name = escapeHtml(options.shoeboxName);
  const preferences =
    options.preferencesUrl === null
      ? ""
      : `<a href="${escapeHtml(options.preferencesUrl)}" style="color:#1b1f22;">Turn these emails off</a> &middot; `;

  return [
    `<div style="padding:24px;background:#ffffff;color:#1b1f22;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">`,
    `<div style="max-width:600px;margin:0 auto;">`,
    `<p style="margin:0;padding-bottom:12px;border-bottom:2px solid #1b1f22;font-size:18px;font-weight:bold;">${name}</p>`,
    options.bodyHtml,
    `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #cccccc;color:#4a4a4a;font-size:14px;">`,
    `<p style="margin:0;">This went to you because you are in ${name}. Nobody outside it can see anything here.</p>`,
    `<p style="margin:8px 0 0;">${preferences}Memory Shoebox, which you can <a href="${SOURCE_URL}" style="color:#1b1f22;">get the source of</a>.</p>`,
    `</div></div></div>`,
  ].join("");
}

/**
 * The plain-text alternative, with the same masthead and footer.
 *
 * The footer is shorter than the HTML one on purpose: the mockup's plain-text
 * `code` state carries one line, and a plain-text message that reproduces
 * every link in the HTML one reads like a machine rather than a note.
 */
export function renderEmailText(options: {
  shoeboxName: string;
  preferencesUrl: string | null;
  bodyText: string;
}): string {
  const lines = [
    options.shoeboxName.toUpperCase(),
    "",
    _wrapPlainText(options.bodyText.trim()),
    "",
    "--",
    `This went to you because you are in ${options.shoeboxName}.`,
  ];
  if (options.preferencesUrl !== null) {
    lines.push(`Turn these emails off: ${options.preferencesUrl}`);
  }
  return `${lines.join("\n")}\n`;
}
