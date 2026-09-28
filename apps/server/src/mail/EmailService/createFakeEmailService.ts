import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EmailSendRequest, EmailService } from "./EmailService.types.ts";

/**
 * The slice of a Playwright page this uses, so a test can stand in for it.
 *
 * Both calls answer `unknown` because nothing here reads what they return, and
 * a narrower promise would stop Playwright's own richer types satisfying it.
 */
export type PdfPage = {
  setContent: (
    html: string,
    options: { waitUntil: "load" },
  ) => Promise<unknown>;
  pdf: (options: {
    path: string;
    format: string;
    printBackground: boolean;
  }) => Promise<unknown>;
};

/**
 * The slice of a Playwright browser this uses.
 *
 * **This is the seam that keeps the unit tests off a real browser.** Naming,
 * the envelope and the returned shape are all provable against a stand-in, so
 * a developer who has not run `playwright install chromium` still gets a
 * meaningful run rather than a wall of failures.
 */
export type PdfBrowser = {
  newPage: () => Promise<PdfPage>;
  close: () => Promise<unknown>;
};

/**
 * Turns an address into something a filesystem is comfortable with.
 *
 * The address is in the name because a run of several messages is easier to
 * read as a file listing than by opening each one. The dot goes the same way
 * the at sign does, so the only dot left in the name is the one before the
 * extension.
 */
function _slugifyAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9-]+/g, "-");
}

/** The characters that would otherwise be read as markup rather than text. */
const _HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/**
 * Escapes one addressing value for the envelope.
 *
 * A `from` normally looks like `My Shoebox <shoebox@example.com>`, and dropped
 * into markup unescaped the address half reads as an unknown element and
 * vanishes from the page. The body is not escaped: it is already the HTML the
 * recipient would have been sent.
 */
function _escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    return _HTML_ESCAPES[character] ?? character;
  });
}

/**
 * What one message is called on disk.
 *
 * Exported so it can be tested without a browser, which is most of what there
 * is to get wrong here.
 *
 * The idempotency key's tail is on the end because the timestamp is not enough
 * on its own. The worker drains a batch in a loop, so two messages to one
 * address can land in the same millisecond, and without the suffix the second
 * silently overwrites the first. Losing a sign-in code that way, in the one
 * mode whose entire purpose is letting a developer read a sign-in code, would
 * look exactly like the mail never being sent.
 *
 * @param options.request The message about to be written.
 * @param options.now When it was written.
 */
export function makeEmailFileNameFromRequest(options: {
  request: EmailSendRequest;
  now: Date;
}): string {
  const instant = options.now.toISOString().replace(/[:.]/g, "-");
  const address = _slugifyAddress(options.request.to);
  const tail = options.request.idempotencyKey
    .slice(-8)
    .replace(/[^a-z0-9]/gi, "");
  return `${instant}__${address}__${tail}.pdf`;
}

/**
 * The envelope a mail client would draw around the message.
 *
 * The rendered HTML is the body of a message and carries no addressing, so a
 * PDF of it alone would not show who it was for or what the subject was, which
 * for `sign_in_code` is where the code actually is.
 */
function _wrapInEnvelope(request: EmailSendRequest): string {
  const rows: Array<[string, string]> = [
    ["From", request.from],
    ["To", request.to],
    ["Subject", request.subject],
  ];
  const header = rows
    .map(([label, value]) => {
      return `<tr><td style="padding:2px 12px 2px 0;color:#4a4a4a;">${label}</td><td style="padding:2px 0;">${_escapeHtml(value)}</td></tr>`;
    })
    .join("");

  return [
    `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;">`,
    `<div style="padding:16px 24px;border-bottom:1px solid #cccccc;font-family:Arial,Helvetica,sans-serif;font-size:13px;">`,
    `<table style="border-collapse:collapse;">${header}</table>`,
    `<p style="margin:12px 0 0;color:#8a8a8a;">Written by Memory Shoebox in fake email mode. Nothing was sent.</p>`,
    `</div>`,
    request.html,
    `</body></html>`,
  ].join("");
}

/**
 * Starts the browser Playwright drives, loading Playwright only now.
 *
 * **The import is inside a function on purpose, and it is half of what keeps a
 * production instance honest.** The other half is that `playwright` is a dev
 * dependency, so a production image, which installs with `--prod`, does not
 * have it on disk at all. Together those mean a production process cannot
 * quietly start writing PDFs instead of sending mail: a wrong variable there
 * does not find a library to fall back on, it fails loudly at the first send.
 * Hoisting this import to the top of the file would break that a second way,
 * by failing the whole server at boot instead.
 */
async function _launchChromium(): Promise<PdfBrowser> {
  const { chromium } = await import("playwright");
  return chromium.launch();
}

/**
 * Builds the service that writes a PDF instead of sending.
 *
 * **Its caller cannot tell.** It takes the same request, returns the same
 * shape, and reports acceptance, so the row goes `sent` exactly as it would
 * have. That is the point: the path exercised in development is the path that
 * runs in production, up to the last step.
 *
 * @param options.outputDirectory Where the PDFs are written. Created if absent.
 * @param options.now Overridable so a test can name a file predictably.
 * @param options.launchBrowser Overridable so a test never needs a browser.
 * @returns A service that writes one PDF per message and reports acceptance.
 */
export function createFakeEmailService(options: {
  outputDirectory: string;
  now?: () => Date;
  launchBrowser?: () => Promise<PdfBrowser>;
}): EmailService {
  const now =
    options.now ??
    (() => {
      return new Date();
    });
  const launchBrowser = options.launchBrowser ?? _launchChromium;

  return {
    send: async (request) => {
      await mkdir(options.outputDirectory, { recursive: true });

      const fileName = makeEmailFileNameFromRequest({ request, now: now() });
      const browser = await launchBrowser();
      try {
        const page = await browser.newPage();
        await page.setContent(_wrapInEnvelope(request), {
          waitUntil: "load",
        });
        await page.pdf({
          path: join(options.outputDirectory, fileName),
          format: "A4",
          printBackground: true,
        });
      } finally {
        await browser.close();
      }

      // A synthetic id, in the shape the provider's would take, so the row
      // records something that says where the message actually went.
      return { providerMessageId: `fake-pdf:${fileName}` };
    },
  };
}
