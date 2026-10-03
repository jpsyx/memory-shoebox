import { describe, expect, it } from "vitest";
import {
  getBrowserRssKbFromRows,
  getProcessRowsFromPsOutput,
} from "./browserMemory";

/** A listing with this process, its Chrome, a helper, WebKit and a stranger. */
const PS_OUTPUT = [
  "  100     1  50000 node uploadProof.ts",
  "  200   100 300000 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe",
  "  201   200 900000 Google Chrome Helper (Renderer) --type=renderer",
  "  300     1 700000 /opt/cache/ms-playwright/webkit-2100/WebKit.framework/XPCServices/com.apple.WebKit.WebContent.xpc",
  "  400     1 123456 /usr/sbin/somebody-else",
  "not a row",
].join("\n");

describe("getProcessRowsFromPsOutput", () => {
  it("reads every row and skips what is not one", () => {
    const rows = getProcessRowsFromPsOutput(PS_OUTPUT);

    expect(rows).toHaveLength(5);
    expect(rows[1]).toEqual({
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

  it("counts Chrome as this process's descendants, and not this process", () => {
    expect(
      getBrowserRssKbFromRows({ rows, browser: "chrome", rootPid: 100 }),
    ).toBe(1_200_000);
  });

  it("counts WebKit as Playwright's WebKit processes, wherever they hang", () => {
    expect(
      getBrowserRssKbFromRows({ rows, browser: "webkit", rootPid: 100 }),
    ).toBe(700_000);
  });
});
