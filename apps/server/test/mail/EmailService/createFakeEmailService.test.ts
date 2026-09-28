import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeEmailService,
  makeEmailFileName,
  type PdfBrowser,
} from "../../../src/mail/EmailService/createFakeEmailService.ts";
import type { EmailSendRequest } from "../../../src/mail/EmailService/EmailService.types.ts";

const REQUEST: EmailSendRequest = {
  from: "My Shoebox <shoebox@example.com>",
  to: "abuela@example.com",
  subject: "Your code is 410233",
  html: "<p>410233</p>",
  text: "410233",
  idempotencyKey: "signin:0192f2a0-7d3c-7000-8000-000000000001",
};

/** Whether the browser the fake needs has been downloaded. */
async function _hasChromium(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * A browser that records what it was asked to render instead of rendering it.
 *
 * It is what lets the naming, the envelope and the returned shape be proven on
 * a machine that has never run `playwright install`.
 */
function _createRecordingBrowser(): {
  browser: PdfBrowser;
  contents: string[];
  paths: string[];
  closed: () => number;
} {
  const contents: string[] = [];
  const paths: string[] = [];
  let closes = 0;

  return {
    browser: {
      newPage: async () => {
        return {
          setContent: async (html: string) => {
            contents.push(html);
          },
          pdf: async (pdfOptions: { path: string }) => {
            paths.push(pdfOptions.path);
          },
        };
      },
      close: async () => {
        closes += 1;
      },
    },
    contents,
    paths,
    closed: () => {
      return closes;
    },
  };
}

describe("makeEmailFileName", () => {
  it("names the file for when it arrived and who it was for", () => {
    const name = makeEmailFileName({
      request: REQUEST,
      now: new Date("2026-09-28T12:34:56.000Z"),
    });

    expect(name).toBe(
      "2026-09-28T12-34-56-000Z__abuela-at-example-com__00000001.pdf",
    );
  });

  it("keeps an awkward address out of the filesystem's way", () => {
    const name = makeEmailFileName({
      request: { ...REQUEST, to: "A.Person+tag@Example.COM" },
      now: new Date("2026-09-28T12:34:56.000Z"),
    });

    expect(name).not.toContain("+");
    expect(name).not.toContain("/");
    expect(name).toMatch(/^[\w.@+-]+\.pdf$/);
  });

  it("keeps two messages of the same instant apart", () => {
    // The worker drains a batch in a loop, so one address receiving two
    // messages in the same millisecond is ordinary rather than contrived. If
    // both took the same name the second would overwrite the first, and the
    // code a developer was waiting for would be the one that vanished.
    const instant = new Date("2026-09-28T12:34:56.000Z");

    const first = makeEmailFileName({ request: REQUEST, now: instant });
    const second = makeEmailFileName({
      request: { ...REQUEST, idempotencyKey: `${REQUEST.idempotencyKey}2` },
      now: instant,
    });

    expect(second).not.toBe(first);
  });
});

describe("createFakeEmailService, with the browser stood in for", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "shoebox-fake-email-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reports acceptance in the shape the provider's answer takes", async () => {
    const recording = _createRecordingBrowser();
    const service = createFakeEmailService({
      outputDirectory: directory,
      now: () => {
        return new Date("2026-09-28T12:34:56.000Z");
      },
      launchBrowser: async () => {
        return recording.browser;
      },
    });

    const result = await service.send(REQUEST);

    expect(result).toEqual({
      providerMessageId:
        "fake-pdf:2026-09-28T12-34-56-000Z__abuela-at-example-com__00000001.pdf",
    });
    expect(recording.paths).toEqual([
      join(
        directory,
        "2026-09-28T12-34-56-000Z__abuela-at-example-com__00000001.pdf",
      ),
    ]);
    expect(recording.closed()).toBe(1);
  });

  it("draws the envelope around the body, so the code can be read", async () => {
    const recording = _createRecordingBrowser();
    const service = createFakeEmailService({
      outputDirectory: directory,
      launchBrowser: async () => {
        return recording.browser;
      },
    });

    await service.send(REQUEST);

    const rendered = recording.contents[0] ?? "";
    expect(rendered).toContain("My Shoebox &lt;shoebox@example.com&gt;");
    expect(rendered).toContain("abuela@example.com");
    expect(rendered).toContain("Your code is 410233");
    expect(rendered).toContain("<p>410233</p>");
    expect(rendered).toContain("Nothing was sent");
  });

  it("closes the browser even when the render fails", async () => {
    let closes = 0;
    const service = createFakeEmailService({
      outputDirectory: directory,
      launchBrowser: async () => {
        return {
          newPage: async () => {
            throw new Error("the page would not open");
          },
          close: async () => {
            closes += 1;
          },
        };
      },
    });

    await expect(service.send(REQUEST)).rejects.toThrow(
      "the page would not open",
    );
    expect(closes).toBe(1);
  });
});

describe("createFakeEmailService, against a real browser", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "shoebox-fake-email-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("writes a PDF and reports the message as accepted", async ({ skip }) => {
    if (!(await _hasChromium())) {
      skip("chromium is not installed: run `npx playwright install chromium`");
    }
    const service = createFakeEmailService({ outputDirectory: directory });

    const result = await service.send(REQUEST);

    const written = readdirSync(directory);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/\.pdf$/);
    expect(statSync(join(directory, written[0] ?? "")).size).toBeGreaterThan(
      1000,
    );
    expect(result.providerMessageId).toContain("fake-pdf");
  }, 60_000);

  it("creates the directory when it is not there yet", async ({ skip }) => {
    if (!(await _hasChromium())) {
      skip("chromium is not installed: run `npx playwright install chromium`");
    }
    const nested = join(directory, "not", "yet", "there");
    const service = createFakeEmailService({ outputDirectory: nested });

    await service.send(REQUEST);

    expect(readdirSync(nested)).toHaveLength(1);
  }, 60_000);
});

describe("the fake cannot be reached by a production process", () => {
  it("keeps playwright a development dependency of the server", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const manifest: unknown = JSON.parse(
      readFileSync(join(here, "../../../package.json"), "utf8"),
    );
    const { dependencies, devDependencies } = manifest as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // The guard is the install, not a flag: a production image installs with
    // `--prod`, so the library the fake needs is simply not on disk there. A
    // typo in a variable cannot put it back.
    expect(Object.keys(dependencies)).not.toContain("playwright");
    expect(Object.keys(devDependencies)).toContain("playwright");
  });

  it("never names playwright at the top of the file", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, "../../../src/mail/EmailService/createFakeEmailService.ts"),
      "utf8",
    );

    // A static import would be evaluated the moment the mail module graph is
    // loaded, which happens in production too, and the missing library would
    // take the whole server down at boot. Only the dynamic one is allowed.
    expect(source).not.toMatch(/^\s*import\s[^\n]*"playwright"/m);
    expect(source).toContain('await import("playwright")');
  });
});
