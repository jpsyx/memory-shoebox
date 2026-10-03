import { describe, expect, it } from "vitest";
import {
  getBrowserRssKbFromRows,
  getProcessRowsFromPsOutput,
} from "./browserMemoryHelpers";

/**
 * A listing with this process (100), the Chrome it launched (200) and its
 * helper, the `ps` this process runs to sample (101), another child that is
 * not a browser (102), a Chrome that another script launched (500) and its
 * helper, WebKit's UI process and its helper, a WebKit that was already
 * running before this one launched (310), a shell whose command line merely
 * mentions the words, and a stranger.
 */
const PS_OUTPUT = [
  "  100     1  50000 node uploadProof.ts",
  "  101   100   2000 ps -A -o pid=,ppid=,rss=,command=",
  "  102   100  80000 /usr/bin/some-other-child",
  "  200   100 300000 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe",
  "  201   200 900000 Google Chrome Helper (Renderer) --type=renderer",
  "  300     1 700000 /opt/cache/ms-playwright/webkit-2100/WebKit.framework/XPCServices/com.apple.WebKit.WebContent.xpc",
  "  310     1 650000 /opt/cache/ms-playwright/webkit-2100/WebKit.framework/XPCServices/com.apple.WebKit.Networking.xpc",
  "  400     1 123456 /usr/sbin/somebody-else",
  "  450   449   5000 zsh -c ls ms-playwright | grep webkit",
  "  500   499 400000 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe",
  "  501   500 600000 Google Chrome Helper (GPU) --type=gpu-process",
  "not a row",
].join("\n");

describe("getProcessRowsFromPsOutput", () => {
  it("reads every row and skips what is not one", () => {
    const rows = getProcessRowsFromPsOutput(PS_OUTPUT);

    expect(rows).toHaveLength(11);
    expect(rows[3]).toEqual({
      pid: 200,
      parentPid: 100,
      rssKb: 300000,
      command:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe",
    });
  });
});

describe("getBrowserRssKbFromRows", () => {
  const rows = getProcessRowsFromPsOutput(PS_OUTPUT);

  it("counts Chrome as the browser this process launched and its descendants, nothing else of this process's, nothing of another's", () => {
    expect(
      getBrowserRssKbFromRows({
        rows,
        browser: "chrome",
        rootPid: 100,
        ignoredPids: new Set(),
      }),
    ).toBe(1_200_000);
  });

  it("counts nothing for Chrome while this process has launched none", () => {
    expect(
      getBrowserRssKbFromRows({
        rows,
        browser: "chrome",
        rootPid: 102,
        ignoredPids: new Set(),
      }),
    ).toBe(0);
  });

  it("counts WebKit as the processes running from Playwright's WebKit build, wherever they hang", () => {
    expect(
      getBrowserRssKbFromRows({
        rows,
        browser: "webkit",
        rootPid: 100,
        ignoredPids: new Set(),
      }),
    ).toBe(1_350_000);
  });

  it("leaves out a WebKit process that was already running before the launch", () => {
    expect(
      getBrowserRssKbFromRows({
        rows,
        browser: "webkit",
        rootPid: 100,
        ignoredPids: new Set([310]),
      }),
    ).toBe(700_000);
  });
});
