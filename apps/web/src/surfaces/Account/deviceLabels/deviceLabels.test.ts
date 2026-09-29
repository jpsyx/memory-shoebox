import { describe, expect, it } from "vitest";
import {
  getDaysLeftLabel,
  getLastUsedLabel,
} from "@/surfaces/Account/deviceLabels/deviceLabels";

const NOW = new Date("2026-09-28T12:00:00.000Z");

describe("getLastUsedLabel", () => {
  it("says today for something used in the last day", () => {
    expect(
      getLastUsedLabel({ lastUsedAt: "2026-09-28T09:00:00.000Z", now: NOW }),
    ).toBe("Today");
  });

  it("says yesterday rather than 1 day ago", () => {
    expect(
      getLastUsedLabel({ lastUsedAt: "2026-09-27T09:00:00.000Z", now: NOW }),
    ).toBe("Yesterday");
  });

  it("counts the days after that", () => {
    expect(
      getLastUsedLabel({ lastUsedAt: "2026-09-25T09:00:00.000Z", now: NOW }),
    ).toBe("3 days ago");
  });
});

describe("getDaysLeftLabel", () => {
  it("says how long a device stays signed in", () => {
    expect(
      getDaysLeftLabel({ expiresAt: "2026-10-28T12:00:00.000Z", now: NOW }),
    ).toBe("30 days left");
  });

  it("warns when it is about to fall out on its own", () => {
    expect(
      getDaysLeftLabel({ expiresAt: "2026-10-02T12:00:00.000Z", now: NOW }),
    ).toBe("Falls out in 4 days");
  });

  it("does not count below a day", () => {
    expect(
      getDaysLeftLabel({ expiresAt: "2026-09-28T18:00:00.000Z", now: NOW }),
    ).toBe("Falls out today");
  });
});
