import { describe, expect, it } from "vitest";
import { getUploadProofArgsFromArgv } from "./uploadProofArgs";

describe("getUploadProofArgsFromArgv", () => {
  it("reads the two required flags and leaves the rest to their defaults", () => {
    expect(
      getUploadProofArgsFromArgv(["--dir", "photos", "--browser", "webkit"]),
    ).toEqual({
      args: {
        dir: "photos",
        browser: "webkit",
        member: undefined,
        concurrency: undefined,
        headless: false,
      },
    });
  });

  it("reads every optional flag, in any order", () => {
    expect(
      getUploadProofArgsFromArgv([
        "--headless",
        "--concurrency",
        "1",
        "--member",
        "abuela@example.com",
        "--browser",
        "chrome",
        "--dir",
        "photos",
      ]),
    ).toEqual({
      args: {
        dir: "photos",
        browser: "chrome",
        member: "abuela@example.com",
        concurrency: 1,
        headless: true,
      },
    });
  });

  it("refuses a missing directory, a missing browser and an unknown one", () => {
    expect(getUploadProofArgsFromArgv(["--browser", "chrome"])).toEqual({
      problem: "--dir <path> is required",
    });
    expect(
      getUploadProofArgsFromArgv(["--dir", "--browser", "chrome"]),
    ).toEqual({
      problem: "--dir <path> is required",
    });
    expect(getUploadProofArgsFromArgv(["--dir", "photos"])).toEqual({
      problem: "--browser must be chrome or webkit",
    });
    expect(
      getUploadProofArgsFromArgv(["--dir", "photos", "--browser", "firefox"]),
    ).toEqual({ problem: "--browser must be chrome or webkit" });
  });

  it("refuses a concurrency outside one to eight", () => {
    ["0", "9", "2.5", "two"].forEach((concurrency) => {
      expect(
        getUploadProofArgsFromArgv([
          "--dir",
          "photos",
          "--browser",
          "chrome",
          "--concurrency",
          concurrency,
        ]),
      ).toEqual({
        problem: "--concurrency must be a whole number from 1 to 8",
      });
    });
  });
});
