/** The two browsers the proof runs in: Chrome itself, Playwright's WebKit. */
export const PROOF_BROWSERS = ["chrome", "webkit"] as const;

/** One of the two. */
export type ProofBrowser = (typeof PROOF_BROWSERS)[number];

/** What `pnpm upload:proof` was asked to do. */
export type UploadProofArgs = {
  /** The directory whose files are picked. Never copied, never printed. */
  dir: string;
  browser: ProofBrowser;
  /** Whose session to mint. Undefined means the first active admin. */
  member: string | undefined;
  /** Lanes. Undefined leaves the harness on its configured default. */
  concurrency: number | undefined;
  headless: boolean;
};

/** The one line printed when the arguments do not make sense. */
export const UPLOAD_PROOF_USAGE =
  "Usage: pnpm upload:proof --dir <path> --browser chrome|webkit [--member <email>] [--concurrency N] [--headless]";

/** Whether a word is one of the two browsers. */
function _isProofBrowser(word: string | undefined): word is ProofBrowser {
  return PROOF_BROWSERS.some((browser) => {
    return browser === word;
  });
}

/** The value after `--name`, or undefined when the flag is absent. */
function _getFlagValue(
  argv: readonly string[],
  name: string,
): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * The arguments, or the reason they are not usable.
 *
 * `--dir` and `--browser` are required; `--concurrency` must be a whole
 * number from 1 to 8, the same bound the harness page applies.
 */
export function getUploadProofArgsFromArgv(
  argv: readonly string[],
): { args: UploadProofArgs } | { problem: string } {
  const dir = _getFlagValue(argv, "dir");
  const browser = _getFlagValue(argv, "browser");
  const concurrencyText = _getFlagValue(argv, "concurrency");
  const concurrency =
    concurrencyText === undefined ? undefined : Number(concurrencyText);
  if (dir === undefined || dir.startsWith("--")) {
    return { problem: "--dir <path> is required" };
  }
  if (!_isProofBrowser(browser)) {
    return { problem: "--browser must be chrome or webkit" };
  }
  if (
    concurrency !== undefined &&
    !(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8)
  ) {
    return { problem: "--concurrency must be a whole number from 1 to 8" };
  }
  return {
    args: {
      dir,
      browser,
      member: _getFlagValue(argv, "member"),
      concurrency,
      headless: argv.includes("--headless"),
    },
  };
}
