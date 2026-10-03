import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProofBrowser } from "./uploadProofArgs";

/*
 * The browser's resident memory, sampled the way the spike sampled it: the
 * RSS of every process that belongs to the browser under test, summed, read
 * from `ps` twice a second. A page cannot measure this about itself, and it
 * is the figure the phone test and the step's record compare.
 */

/** One row of `ps -A -o pid=,ppid=,rss=,command=`. */
export type ProcessRow = {
  pid: number;
  parentPid: number;
  rssKb: number;
  command: string;
};

/** The peak and the baseline it is measured over, in kilobytes. */
export type BrowserMemory = { baselineKb: number; peakKb: number };

const execFileAsync = promisify(execFile);

/** Every row `ps` printed, skipping any line that is not one. */
export function getProcessRowsFromPsOutput(psOutput: string): ProcessRow[] {
  return psOutput.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (match === null) {
      return [];
    }
    const [, pid, parentPid, rssKb, command] = match;
    return [
      {
        pid: Number(pid),
        parentPid: Number(parentPid),
        rssKb: Number(rssKb),
        command: command ?? "",
      },
    ];
  });
}

/** Every process descended from `rootPid`, the root itself not included. */
function _getDescendantRows(
  rows: readonly ProcessRow[],
  rootPid: number,
): ProcessRow[] {
  const children = rows.filter((row) => {
    return row.parentPid === rootPid;
  });
  return children.flatMap((child) => {
    return [child, ..._getDescendantRows(rows, child.pid)];
  });
}

/** Playwright starts Chrome with this, the pipe it drives the browser over. */
const CHROME_LAUNCH_FLAG = "--remote-debugging-pipe";

/** Where Playwright keeps its WebKit build, which every WebKit process runs from. */
const WEBKIT_BUILD_PATH = /ms-playwright\/webkit-\d+\//;

/**
 * The browser's RSS, from one `ps` listing.
 *
 * Playwright's `launch()` does not hand back the browser's process id (only
 * `launchServer()` does), so each engine's processes are found in the listing.
 *
 * Chrome is the child of this process that carries Playwright's launch flag,
 * and everything descended from it: its helpers are all children of it. The
 * `ps` this process runs to sample, and any other child, are not counted.
 *
 * WebKit's web content, networking and graphics processes are XPC services
 * the system starts, not children of anything of ours, so the tree cannot
 * find them: WebKit is every process running from Playwright's WebKit build,
 * except those in `ignoredPids`, which were running before this launch (a
 * test run, another proof) and are not this browser's.
 */
export function getBrowserRssKbFromRows(
  options: Readonly<{
    rows: readonly ProcessRow[];
    browser: ProofBrowser;
    rootPid: number;
    /** Every process that existed before the launch. Only WebKit reads it. */
    ignoredPids: ReadonlySet<number>;
  }>,
): number {
  const rows =
    options.browser === "chrome"
      ? options.rows
          .filter((row) => {
            return (
              row.parentPid === options.rootPid &&
              row.command.includes(CHROME_LAUNCH_FLAG)
            );
          })
          .flatMap((browserProcess) => {
            return [
              browserProcess,
              ..._getDescendantRows(options.rows, browserProcess.pid),
            ];
          })
      : options.rows.filter((row) => {
          return (
            WEBKIT_BUILD_PATH.test(row.command) &&
            !options.ignoredPids.has(row.pid)
          );
        });
  return rows.reduce((sum, row) => {
    return sum + row.rssKb;
  }, 0);
}

/** Every process, or null where `ps` is not there to ask (Windows). */
async function _listProcessRows(): Promise<ProcessRow[] | null> {
  const listing = await execFileAsync("ps", [
    "-A",
    "-o",
    "pid=,ppid=,rss=,command=",
  ]).catch(() => {
    return null;
  });
  return listing === null ? null : getProcessRowsFromPsOutput(listing.stdout);
}

/**
 * Starts sampling, so call it before the browser is launched: it notes which
 * processes already exist (WebKit's count excludes them) and then reads twice
 * a second. `fixBaseline` waits two seconds and takes the highest reading so
 * far as the baseline, which is the spike's rule; `stop` answers the peak
 * over it, or null when nothing could be read.
 */
export async function startBrowserMemorySampler(
  browser: ProofBrowser,
): Promise<{
  fixBaseline: () => Promise<void>;
  stop: () => BrowserMemory | null;
}> {
  const ignoredPids = new Set(
    ((await _listProcessRows()) ?? []).map((row) => {
      return row.pid;
    }),
  );
  const readings: number[] = [];
  let baselineKb: number | null = null;
  const timer = setInterval(() => {
    void _listProcessRows().then((rows) => {
      if (rows !== null) {
        readings.push(
          getBrowserRssKbFromRows({
            rows,
            browser,
            rootPid: process.pid,
            ignoredPids,
          }),
        );
      }
    });
  }, 500);
  return {
    fixBaseline: async () => {
      await new Promise((settle) => {
        setTimeout(settle, 2000);
      });
      baselineKb = readings.length === 0 ? null : Math.max(...readings);
    },
    stop: () => {
      clearInterval(timer);
      return baselineKb === null || readings.length === 0
        ? null
        : { baselineKb, peakKb: Math.max(...readings) };
    },
  };
}
