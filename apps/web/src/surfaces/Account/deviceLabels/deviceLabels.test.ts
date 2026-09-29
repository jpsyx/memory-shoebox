import { describe, expect, it } from "vitest";
import {
  daysLeftLabel,
  lastUsedLabel,
} from "@/surfaces/Account/deviceLabels/deviceLabels";

const NOW = new Date("2026-09-28T12:00:00.000Z");

describe("lastUsedLabel", () => {
  it("says today for something used in the last day", () => {
    expect(
      lastUsedLabel({ lastUsedAt: "2026-09-28T09:00:00.000Z", now: NOW }),
    ).toBe("Today");
  });

  it("says yesterday rather than 1 day ago", () => {
    expect(
      lastUsedLabel({ lastUsedAt: "2026-09-27T09:00:00.000Z", now: NOW }),
    ).toBe("Yesterday");
  });

  it("counts the days after that", () => {
    expect(
      lastUsedLabel({ lastUsedAt: "2026-09-25T09:00:00.000Z", now: NOW }),
    ).toBe("3 days ago");
  });
});

describe("daysLeftLabel", () => {
  it("says how long a device stays signed in", () => {
    expect(
      daysLeftLabel({ expiresAt: "2026-10-28T12:00:00.000Z", now: NOW }),
    ).toBe("30 days left");
  });

  it("warns when it is about to fall out on its own", () => {
    expect(
      daysLeftLabel({ expiresAt: "2026-10-02T12:00:00.000Z", now: NOW }),
    ).toBe("Falls out in 4 days");
  });

  it("does not count below a day", () => {
    expect(
      daysLeftLabel({ expiresAt: "2026-09-28T18:00:00.000Z", now: NOW }),
    ).toBe("Falls out today");
  });
});
