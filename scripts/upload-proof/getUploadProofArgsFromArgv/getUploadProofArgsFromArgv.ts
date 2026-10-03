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

/** The flags that take a value after them. `--headless` takes none. */
const VALUE_FLAGS = ["dir", "browser", "member", "concurrency"] as const;

/** One of the flags that takes a value. */
type ValueFlag = (typeof VALUE_FLAGS)[number];

/** What the command line said, before any of it is judged. */
type FlagReading = {
  values: Partial<Record<ValueFlag, string>>;
  /** Flags that were the last word, or were followed by another flag. */
  flagsMissingValue: ValueFlag[];
  isHeadless: boolean;
  /** The first word that is not a flag this command has, or undefined. */
  unknownWord: string | undefined;
};

/**
 * Reads every word: each value flag with the word after it, `--headless`, and
 * the first word that is none of those. A lone `--`, which a package manager
 * may pass along, is skipped.
 */
function _readFlags(argv: readonly string[]): FlagReading {
  const valueIndexes = new Set<number>();
  const tokens = argv.flatMap((word, index) => {
    if (valueIndexes.has(index) || word === "--") {
      return [];
    }
    const flag = VALUE_FLAGS.find((candidate) => {
      return word === `--${candidate}`;
    });
    const value = argv[index + 1];
    const hasValue =
      flag !== undefined && value !== undefined && !value.startsWith("--");
    if (hasValue) {
      valueIndexes.add(index + 1);
    }
    return [{ word, flag, value: hasValue ? value : undefined }];
  });
  return {
    values: Object.fromEntries(
      tokens.flatMap((token) => {
        return token.flag !== undefined && token.value !== undefined
          ? [[token.flag, token.value]]
          : [];
      }),
    ),
    flagsMissingValue: tokens.flatMap((token) => {
      return token.flag !== undefined && token.value === undefined
        ? [token.flag]
        : [];
    }),
    isHeadless: tokens.some((token) => {
      return token.word === "--headless";
    }),
    unknownWord: tokens.find((token) => {
      return token.word !== "--headless" && token.flag === undefined;
    })?.word,
  };
}

/**
 * The arguments, or the reason they are not usable.
 *
 * `--dir` and `--browser` are required; `--concurrency` must be a whole
 * number from 1 to 8, the same bound the harness page applies. A flag with no
 * value, a flag this command does not have and a stray word are refused
 * rather than ignored, so a typo never quietly runs the defaults.
 */
export function getUploadProofArgsFromArgv(
  argv: readonly string[],
): { args: UploadProofArgs } | { problem: string } {
  const reading = _readFlags(argv);
  const { browser, concurrency: concurrencyText, dir, member } = reading.values;
  const concurrency =
    concurrencyText === undefined ? undefined : Number(concurrencyText);
  if (reading.unknownWord !== undefined) {
    return { problem: `Unknown argument: ${reading.unknownWord}` };
  }
  if (dir === undefined) {
    return { problem: "--dir <path> is required" };
  }
  if (!_isProofBrowser(browser)) {
    return { problem: "--browser must be chrome or webkit" };
  }
  const missing = reading.flagsMissingValue.find((flag) => {
    return flag === "member" || flag === "concurrency";
  });
  if (missing !== undefined) {
    return { problem: `--${missing} needs a value` };
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
      member,
      concurrency,
      headless: reading.isHeadless,
    },
  };
}
