import { afterEach, describe, expect, it, vi } from "vitest";

import { makeImageDataFromHeic } from "@/upload/makeImageDataFromHeic/makeImageDataFromHeic";

import { getDecodeSizeFromPlan } from "@/upload/makeImageDerivativesFromFile/getDecodeSizeFromPlan";

import { getDerivativePlanFromSize } from "@/upload/makeImageDerivativesFromFile/getDerivativePlanFromSize";

vi.mock("@/upload/makeImageDataFromHeic/makeImageDataFromHeic", () => {
  return { makeImageDataFromHeic: vi.fn() };
});

const DISPLAY = { purpose: "display", longEdgePx: 2048 };

const THUMB = { purpose: "thumb", longEdgePx: 480 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(makeImageDataFromHeic).mockReset();
});
describe("getDerivativePlanFromSize", () => {
  it("plans both for a full-size photograph", () => {
    expect(
      getDerivativePlanFromSize({
        contentType: "image/jpeg",
        size: { width: 4032, height: 3024 },
      }),
    ).toEqual([DISPLAY, THUMB]);
  });
});
describe("getDerivativePlanFromSize", () => {
  it("skips what a JPEG already is: a 1600 px one needs only a thumb", () => {
    expect(
      getDerivativePlanFromSize({
        contentType: "image/jpeg",
        size: { width: 1600, height: 1200 },
      }),
    ).toEqual([THUMB]);
  });
});
describe("getDerivativePlanFromSize", () => {
  it("makes nothing from a JPEG already thumbnail-sized", () => {
    expect(
      getDerivativePlanFromSize({
        contentType: "image/jpeg",
        size: { width: 480, height: 360 },
      }),
    ).toEqual([]);
  });
});
describe("getDerivativePlanFromSize", () => {
  it("still re-encodes a small PNG or HEIC, which is no JPEG to fall back to", () => {
    const small = { width: 800, height: 600 };

    expect(
      getDerivativePlanFromSize({ contentType: "image/png", size: small }),
    ).toEqual([DISPLAY, THUMB]);
    expect(
      getDerivativePlanFromSize({ contentType: "image/heic", size: small }),
    ).toEqual([DISPLAY, THUMB]);
  });
});
describe("getDerivativePlanFromSize", () => {
  it("plans both when the header had no size, to decide after the decode", () => {
    expect(
      getDerivativePlanFromSize({ contentType: "image/jpeg", size: undefined }),
    ).toEqual([DISPLAY, THUMB]);
  });
});
describe("getDecodeSizeFromPlan", () => {
  it("decodes straight to the largest planned size", () => {
    expect(
      getDecodeSizeFromPlan({
        size: { width: 4032, height: 3024 },
        plan: [
          { purpose: "display", longEdgePx: 2048 },
          { purpose: "thumb", longEdgePx: 480 },
        ],
      }),
    ).toEqual({ width: 2048, height: 1536 });
  });
});
describe("getDecodeSizeFromPlan", () => {
  it("decodes at native size when the largest target is no shrink", () => {
    expect(
      getDecodeSizeFromPlan({
        size: { width: 800, height: 600 },
        plan: [{ purpose: "display", longEdgePx: 2048 }],
      }),
    ).toBeUndefined();
  });
});
describe("getDecodeSizeFromPlan", () => {
  it("compares long edges, so a thin strip is still shrunk", () => {
    expect(
      getDecodeSizeFromPlan({
        size: { width: 1, height: 5000 },
        plan: [{ purpose: "thumb", longEdgePx: 480 }],
      }),
    ).toEqual({ width: 1, height: 480 });
  });
});
describe("getDecodeSizeFromPlan", () => {
  it("decodes at native size when the size is not known yet", () => {
    expect(
      getDecodeSizeFromPlan({
        size: undefined,
        plan: [{ purpose: "display", longEdgePx: 2048 }],
      }),
    ).toBeUndefined();
  });
});
