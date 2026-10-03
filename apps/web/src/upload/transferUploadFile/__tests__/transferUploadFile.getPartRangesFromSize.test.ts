import { T0 } from "./transferUploadFileTestHelpers";

import { describe, expect, it, vi } from "vitest";

import {
  getBackoffDelayMsFromAttempt,
  getPartRangesFromSize,
  getRemainingLifetimeMsFromReceipt,
  getRequiredLifetimeMsFromRate,
  isLeaseLongEnoughForBytes,
  isPartPlanFeasible,
} from "@/upload/transferUploadFile/transferPlanningHelpers";

describe("getPartRangesFromSize", () => {
  it("cuts the last part short", () => {
    expect(getPartRangesFromSize({ byteSize: 10, partSizeBytes: 4 })).toEqual([
      { partNumber: 1, start: 0, end: 4 },
      { partNumber: 2, start: 4, end: 8 },
      { partNumber: 3, start: 8, end: 10 },
    ]);
  });

  it("makes whole parts of an exact multiple, and none of nothing", () => {
    expect(
      getPartRangesFromSize({ byteSize: 8, partSizeBytes: 4 }),
    ).toHaveLength(2);
    expect(getPartRangesFromSize({ byteSize: 0, partSizeBytes: 4 })).toEqual(
      [],
    );
  });
});

describe("getRequiredLifetimeMsFromRate", () => {
  it("plans for the floor before anything has been measured", () => {
    expect(
      getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: undefined,
      }),
    ).toBe(1_546_000);
  });

  it("plans for the measured rate when the link is faster", () => {
    expect(
      getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: 2 * 1024 * 1024,
      }),
    ).toBe(22_000);
  });

  it("never plans below the floor, so a fresh URL always suffices", () => {
    expect(
      getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: 10,
      }),
    ).toBe(1_546_000);
    expect(isPartPlanFeasible()).toBe(true);
    expect(
      isPartPlanFeasible({
        partSizeBytes: 16 * 1024 * 1024,
        presignTtlSeconds: 600,
      }),
    ).toBe(false);
  });
});

describe("isLeaseLongEnoughForBytes", () => {
  it("judges a URL at the floor rate, so a PUT started on it ends before it lapses", () => {
    // 1 MiB at 16 KiB/s is 64 s; half again and ten seconds is 106 s.
    const lease = { receivedAtMs: T0, presignTtlSeconds: 3600 };

    expect(
      isLeaseLongEnoughForBytes({
        ...lease,
        nowMs: T0 + 3_600_000 - 106_000,
        byteCount: 1024 * 1024,
      }),
    ).toBe(true);
    expect(
      isLeaseLongEnoughForBytes({
        ...lease,
        nowMs: T0 + 3_600_000 - 105_000,
        byteCount: 1024 * 1024,
      }),
    ).toBe(false);
  });
});

describe("getRemainingLifetimeMsFromReceipt", () => {
  it("counts the URL's life from when it arrived, on the caller's own clock", () => {
    expect(
      getRemainingLifetimeMsFromReceipt({
        receivedAtMs: T0,
        nowMs: T0 + 1000,
        presignTtlSeconds: 3600,
      }),
    ).toBe(3_599_000);
    expect(
      getRemainingLifetimeMsFromReceipt({
        receivedAtMs: T0,
        nowMs: T0 + 4_000_000,
        presignTtlSeconds: 3600,
      }),
    ).toBe(-400_000);
  });
});

describe("the floor rate", () => {
  it("is the configured floor, not a figure of the planner's own", async () => {
    vi.resetModules();
    vi.doMock("../../../../../../app.config", async (importOriginal) => {
      const original =
        await importOriginal<typeof import("../../../../../../app.config")>();
      return {
        appConfig: {
          ...original.appConfig,
          upload: {
            ...original.appConfig.upload,
            transferFloorBytesPerSecond: 32 * 1024,
          },
        },
      };
    });

    const planning =
      await import("@/upload/transferUploadFile/transferPlanningHelpers");

    // 16 MiB at a doubled floor of 32 KiB/s: 512 s, half again, plus 10 s.
    expect(planning.FLOOR_BYTES_PER_SECOND).toBe(32 * 1024);
    expect(
      planning.getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: undefined,
      }),
    ).toBe(778_000);
    vi.doUnmock("../../../../../../app.config");
    vi.resetModules();
  });
});

describe("getBackoffDelayMsFromAttempt", () => {
  it("doubles from the base and stops at the cap", () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((attempt) => {
        return getBackoffDelayMsFromAttempt({
          attempt,
          baseDelayMs: 1000,
          maxDelayMs: 16_000,
        });
      }),
    ).toEqual([1000, 2000, 4000, 8000, 16_000, 16_000]);
  });
});
