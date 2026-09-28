import { describe, expect, it } from "vitest";
import { getDeviceLabelFromUserAgent } from "../../src/auth/getDeviceLabelFromUserAgent.ts";

/**
 * The strings these browsers actually send. The nesting is the whole point:
 * Edge claims Chrome, Chrome claims Safari, and Samsung Internet claims both,
 * so the order the patterns are tried in is what makes the label right.
 */
const USER_AGENTS = [
  {
    label: "iPhone, Safari",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  {
    label: "iPhone, Chrome",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  },
  {
    label: "iPad, Safari",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  {
    label: "Mac, Safari",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  },
  {
    label: "Windows, Edge",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  },
  {
    label: "Windows, Firefox",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  },
  {
    label: "Android, Chrome",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  },
  {
    label: "Android, Samsung Internet",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  },
] as const;

describe("getDeviceLabelFromUserAgent", () => {
  it.each(USER_AGENTS)("reads $label", ({ label, userAgent }) => {
    expect(getDeviceLabelFromUserAgent(userAgent)).toBe(label);
  });

  it("names the device when it recognises only the platform", () => {
    expect(
      getDeviceLabelFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)"),
    ).toBe("Mac");
  });

  it("falls back to the raw string when it recognises neither half", () => {
    expect(getDeviceLabelFromUserAgent("curl/8.4.0")).toBe("curl/8.4.0");
  });

  it("truncates a long unrecognised string", () => {
    expect(getDeviceLabelFromUserAgent("x".repeat(400))).toHaveLength(80);
  });

  it("names something rather than nothing when there is no header", () => {
    expect(getDeviceLabelFromUserAgent(undefined)).toBe("Unknown device");
    expect(getDeviceLabelFromUserAgent("   ")).toBe("Unknown device");
  });
});
