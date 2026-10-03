import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, type Browser, type Page } from "@playwright/test";
import { SESSION_COOKIE_NAME } from "../../apps/server/src/auth/sessionCookie";
import {
  uploadProofReportSchema,
  type UploadProofReport,
} from "../../apps/web/src/upload/proof/uploadProofReport/uploadProofReport";
import { startBrowserMemorySampler, type BrowserMemory } from "./browserMemory";
import { mintProofSession } from "./mintProofSession";
import {
  getUploadProofArgsFromArgv,
  UPLOAD_PROOF_USAGE,
  type UploadProofArgs,
} from "./uploadProofArgs";
import { makeSummaryLinesFromReport } from "./uploadProofSummary";

/**
 * `pnpm upload:proof`: the step file's "200-file batch end to end against a
 * real bucket", and the same page a phone opens for the on-device test.
 *
 * Mints a session for a member straight into the development catalog,
 * launches a real browser with that session's cookie on the Vite origin,
 * opens the harness, picks every file in `--dir`, waits for the run to end
 * and prints the summary. The files are handed to the browser by path and
 * never copied; nothing in them is ever printed.
 *
 * Usage: see `UPLOAD_PROOF_USAGE`.
 */

/** Where `pnpm dev` serves the app, and so the harness and the `/api` proxy. */
const DEV_ORIGIN = "http://localhost:5173";

/** What has to be running before this can work, printed on every start. */
const PREREQUISITES = [
  "pnpm upload:proof needs, before it starts:",
  "  - pnpm dev running, the API on :8080 and the app on :5173",
  "  - the bucket's CORS rule applied: pnpm b2:cors",
];

/** Every picked file: the directory's own files, not its dotfiles, sorted. */
function _listFiles(directory: string): string[] {
  const absolute = resolve(directory);
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => {
      return entry.isFile() && !entry.name.startsWith(".");
    })
    .map((entry) => {
      return join(absolute, entry.name);
    })
    .sort();
}

/** Throws, naming the prerequisite, when the dev server or the API is down. */
async function _assertDevServerIsUp(): Promise<void> {
  const harness = await fetch(`${DEV_ORIGIN}/upload-proof.html`).catch(() => {
    return null;
  });
  const health = await fetch(`${DEV_ORIGIN}/api/health`).catch(() => {
    return null;
  });
  if (harness?.ok !== true || health?.ok !== true) {
    throw new Error(
      `Nothing answered at ${DEV_ORIGIN} with the harness and /api/health. Is pnpm dev running?`,
    );
  }
}

/**
 * A page on the harness, signed in as the minted session.
 *
 * The cookie is the server's own name and attributes, except `Secure` on
 * WebKit: Playwright's WebKit drops a `Secure` cookie on `http://localhost`,
 * whether it arrives in a `Set-Cookie` or through `addCookies`, so there it
 * is set without. The server reads the header either way.
 */
async function _openSignedInHarness(options: {
  browser: Browser;
  args: UploadProofArgs;
  token: string;
}): Promise<Page> {
  const { args } = options;
  const context = await options.browser.newContext();
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: options.token,
      url: DEV_ORIGIN,
      httpOnly: true,
      sameSite: "Lax",
      secure: args.browser === "chrome",
    },
  ]);
  const page = await context.newPage();
  const query =
    args.concurrency === undefined ? "" : `?concurrency=${args.concurrency}`;
  await page.goto(`${DEV_ORIGIN}/upload-proof.html${query}`);
  // The first load of a dev server pre-bundles dependencies, so the page
  // can take a while to publish its state; picking before it listens would
  // pick into nothing.
  await page.waitForFunction(
    "window.__uploadProof?.phase === 'idle'",
    undefined,
    { timeout: 120_000 },
  );
  return page;
}

/**
 * Picks the files on the harness and waits, without limit, for the end,
 * sampling the browser's memory from its idle page to the last file.
 *
 * The end is the harness's `finished` or `failed` phase, never a `settled`
 * engine event: the engine emits at most one per run and none for a run no
 * `complete` answered, and the harness ends a run when `start` resolves.
 */
async function _runInBrowser(options: {
  args: UploadProofArgs;
  paths: string[];
  token: string;
}): Promise<{ report: UploadProofReport; memory: BrowserMemory | null }> {
  const { args } = options;
  // The flag makes `performance.memory`, which the harness's JS heap peak
  // reads, precise; without it Chrome rounds and jitters the figures. The
  // RSS read from `ps` stays the primary memory figure either way.
  const browser =
    args.browser === "chrome"
      ? await chromium.launch({
          channel: "chrome",
          headless: args.headless,
          args: ["--enable-precise-memory-info"],
        })
      : await webkit.launch({ headless: args.headless });
  const sampler = startBrowserMemorySampler(args.browser);
  try {
    const page = await _openSignedInHarness({ ...options, browser });
    await sampler.fixBaseline();
    await page.setInputFiles('input[type="file"]', options.paths);
    await page.waitForFunction(
      "['finished', 'failed'].includes(window.__uploadProof?.phase)",
      undefined,
      { timeout: 0 },
    );
    const memory = sampler.stop();
    const json: unknown = await page.evaluate(
      "JSON.stringify(window.__uploadProof)",
    );
    const report = uploadProofReportSchema.parse(JSON.parse(String(json)));
    return { report, memory };
  } finally {
    sampler.stop();
    await browser.close();
  }
}

/** Runs the proof when the script is executed rather than imported. */
async function _main(): Promise<void> {
  const parsed = getUploadProofArgsFromArgv(process.argv.slice(2));
  if ("problem" in parsed) {
    process.stderr.write(`${parsed.problem}\n${UPLOAD_PROOF_USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const { args } = parsed;
  process.stdout.write(`${PREREQUISITES.join("\n")}\n\n`);
  const paths = _listFiles(args.dir);
  await _assertDevServerIsUp();
  const session = await mintProofSession({ memberEmail: args.member });
  process.stdout.write(
    `Picking ${paths.length} files as ${session.memberEmail} in ${args.browser}\n`,
  );
  try {
    const run = await _runInBrowser({ args, paths, token: session.token });
    const lines = makeSummaryLinesFromReport(run);
    process.stdout.write(`${lines.join("\n")}\n`);
    process.exitCode = run.report.phase === "finished" ? 0 : 1;
  } finally {
    await session.end();
  }
}

// Only run when invoked directly, not when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
