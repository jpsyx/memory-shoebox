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

/**
 * The browser's RSS, from one `ps` listing.
 *
 * Chrome's helpers are all children of the Chrome this process launched, so
 * Chrome is this process's descendants. WebKit's are not: its web content and
 * networking processes are XPC services started by the system, so WebKit is
 * every process running from Playwright's WebKit build.
 */
export function getBrowserRssKbFromRows(
  options: Readonly<{
    rows: readonly ProcessRow[];
    browser: ProofBrowser;
    rootPid: number;
  }>,
): number {
  const rows =
    options.browser === "chrome"
      ? _getDescendantRows(options.rows, options.rootPid)
      : options.rows.filter((row) => {
          return (
            /ms-playwright/.test(row.command) && /webkit/i.test(row.command)
          );
        });
  return rows.reduce((sum, row) => {
    return sum + row.rssKb;
  }, 0);
}

/** One reading, or null where `ps` is not there to ask (Windows). */
async function _sampleRssKb(browser: ProofBrowser): Promise<number | null> {
  const listing = await execFileAsync("ps", [
    "-A",
    "-o",
    "pid=,ppid=,rss=,command=",
  ]).catch(() => {
    return null;
  });
  return listing === null
    ? null
    : getBrowserRssKbFromRows({
        rows: getProcessRowsFromPsOutput(listing.stdout),
        browser,
        rootPid: process.pid,
      });
}

/**
 * Starts sampling. `fixBaseline` waits two seconds and takes the highest
 * reading so far as the baseline, which is the spike's rule; `stop` answers
 * the peak over it, or null when nothing could be read.
 */
export function startBrowserMemorySampler(browser: ProofBrowser): {
  fixBaseline: () => Promise<void>;
  stop: () => BrowserMemory | null;
} {
  const readings: number[] = [];
  let baselineKb: number | null = null;
  const timer = setInterval(() => {
    void _sampleRssKb(browser).then((kb) => {
      if (kb !== null) {
        readings.push(kb);
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
