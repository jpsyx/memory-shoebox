import { fileURLToPath } from "node:url";
import { chromium, webkit, type Browser, type Page } from "@playwright/test";
import { SESSION_COOKIE_NAME } from "../../apps/server/src/auth/sessionCookie";
import {
  uploadProofReportSchema,
  type UploadProofReport,
} from "../../apps/web/src/upload/proof/uploadProofReport.constants";
import {
  startBrowserMemorySampler,
  type BrowserMemory,
} from "./browserMemoryHelpers/browserMemoryHelpers";
import {
  loadServerEnvFile,
  mintProofSession,
  SERVER_DIRECTORY,
  type ProofSession,
} from "./mintProofSessionHelpers/mintProofSessionHelpers";
import { watchForMainFrameNavigation } from "./watchForMainFrameNavigation/watchForMainFrameNavigation";
import {
  createProofCleanup,
  installProofSignalHandlers,
  type ProofCleanup,
} from "./proofCleanupHelpers/proofCleanupHelpers";
import { getProofFilePathsFromDirectory } from "./getProofFilePathsFromDirectory/getProofFilePathsFromDirectory";
import {
  getUploadProofArgsFromArgv,
  UPLOAD_PROOF_USAGE,
  type UploadProofArgs,
} from "./getUploadProofArgsFromArgv/getUploadProofArgsFromArgv";
import { makeSummaryLinesFromReport } from "./uploadProofSummaryHelpers/uploadProofSummaryHelpers";

/** Inputs for _runInBrowser. */
type RunInBrowserOptions = {
  args: UploadProofArgs;
  paths: string[];
  token: string;
  cleanup: ProofCleanup;
};

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

/** Throws, naming the prerequisite, when the dev server or the API is down. */
async function _assertDevServerIsUp(): Promise<void> {
  const harness = await fetch(`${DEV_ORIGIN}/upload-proof.html`).catch(() => {
    return undefined;
  });
  const health = await fetch(`${DEV_ORIGIN}/api/health`).catch(() => {
    return undefined;
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
 * Playwright's own handling of Ctrl-C, SIGTERM and SIGHUP closes the browser
 * and then exits the process, so nothing after it runs, the minted session's
 * deletion included. They are off, and `installProofSignalHandlers` does it
 * all.
 */
const SIGNALS_ARE_OURS = {
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
};

/**
 * Launches the browser under test. Chrome gets
 * `--enable-precise-memory-info`: it makes `performance.memory`, which the
 * harness's JS heap peak reads, precise, where otherwise Chrome rounds and
 * jitters it. The RSS read from `ps` stays the primary memory figure either
 * way.
 */
function _launchBrowser(args: UploadProofArgs): Promise<Browser> {
  return args.browser === "chrome"
    ? chromium.launch({
        channel: "chrome",
        headless: args.headless,
        args: ["--enable-precise-memory-info"],
        ...SIGNALS_ARE_OURS,
      })
    : webkit.launch({ headless: args.headless, ...SIGNALS_ARE_OURS });
}

/**
 * Picks the files on the harness and waits, without limit, for the end,
 * sampling the browser's memory from its idle page to the last file.
 *
 * The end is the harness's `finished` or `failed` phase, never a `settled`
 * engine event: the engine emits at most one per run and none for a run no
 * `complete` answered, and the harness ends a run when `start` resolves. A
 * reload of the page is no end but the loss of the run, so it fails the wait.
 *
 * What it opens is registered with `cleanup` as it goes, so the browser is
 * closed however this ends, a signal included.
 */
async function _runInBrowser(
  options: RunInBrowserOptions,
): Promise<{ report: UploadProofReport; memory: BrowserMemory | undefined }> {
  const { args, cleanup } = options;
  const sampler = await startBrowserMemorySampler(args.browser);
  cleanup.add(() => {
    sampler.stop();
  });
  const browser = await _launchBrowser(args);
  cleanup.add(() => {
    return browser.close();
  });
  const page = await _openSignedInHarness({ ...options, browser });
  await sampler.fixBaseline();
  const watch = watchForMainFrameNavigation(page);
  try {
    await page.setInputFiles('input[type="file"]', options.paths);
    await Promise.race([
      page.waitForFunction(
        "['finished', 'failed'].includes(window.__uploadProof?.phase)",
        undefined,
        { timeout: 0 },
      ),
      watch.navigated,
    ]);
  } finally {
    watch.stop();
  }
  const memory = sampler.stop();
  const json: unknown = await page.evaluate(
    "JSON.stringify(window.__uploadProof, (_key, value) => value === undefined ? null : value)",
  );
  const report = uploadProofReportSchema.parse(JSON.parse(String(json)));
  return { report, memory };
}

/**
 * Runs the proof as a minted session and undoes everything it opened,
 * however it ends: the end of the run, an error, or Ctrl-C, SIGTERM or
 * SIGHUP, which Node would otherwise answer by exiting with the session row
 * still in the catalog.
 */
async function _runProof(options: {
  args: UploadProofArgs;
  paths: string[];
  session: ProofSession;
}): Promise<void> {
  const { args, paths, session } = options;
  const cleanup = createProofCleanup();
  cleanup.add(() => {
    return session.end();
  });
  const stopHandlingSignals = installProofSignalHandlers({
    cleanup,
    signalSource: process,
    exit: (code) => {
      process.exit(code);
    },
    writeLine: (text) => {
      process.stderr.write(`${text}\n`);
    },
  });
  try {
    process.stdout.write(
      `Picking ${paths.length} files as ${session.memberEmail} in ${args.browser}\n`,
    );
    const run = await _runInBrowser({
      args,
      paths,
      token: session.token,
      cleanup,
    });
    process.stdout.write(`${makeSummaryLinesFromReport(run).join("\n")}\n`);
    process.exitCode = run.report.phase === "finished" ? 0 : 1;
  } finally {
    const failures = await cleanup.run();
    stopHandlingSignals();
    failures.forEach((failure) => {
      process.stderr.write(`Cleanup failed: ${failure}\n`);
      process.exitCode = 1;
    });
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
  process.stdout.write(
    `${(
      [
        "pnpm upload:proof needs, before it starts:",
        "  - pnpm dev running, the API on :8080 and the app on :5173",
        "  - the bucket's CORS rule applied: pnpm b2:cors",
      ] as const
    ).join("\n")}\n\n`,
  );
  // Before anything is minted: an empty pick would be ignored by the harness,
  // and the wait for its end has no limit.
  const files = getProofFilePathsFromDirectory(args.dir);
  if ("problem" in files) {
    process.stderr.write(`${files.problem}\n`);
    process.exitCode = 1;
    return;
  }
  await _assertDevServerIsUp();
  loadServerEnvFile(SERVER_DIRECTORY);
  const session = await mintProofSession({
    memberEmail: args.member,
    env: process.env,
    serverDirectory: SERVER_DIRECTORY,
  });
  await _runProof({ args, paths: files.paths, session });
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
