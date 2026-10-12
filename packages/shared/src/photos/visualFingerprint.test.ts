import { describe, expect, it } from "vitest";
import * as shared from "../index.ts";

function _makePixels(seed: number, adjustment = 0): Uint8Array {
  return Uint8Array.from({ length: 32 * 32 * 4 }, (_, index) => {
    const pixel = Math.floor(index / 4);
    const channel = index % 4;
    return channel === 3
      ? 255
      : Math.round(
          120 +
            adjustment +
            55 * Math.sin((pixel % 32) / (seed + 2) + channel) +
            50 * Math.cos(Math.floor(pixel / 32) / (seed + 3)),
        );
  });
}

describe("visual photo identity", () => {
  it("matches slightly changed pixels without treating different compositions as duplicates", () => {
    const original = shared.makeVisualFingerprintFromRgba(_makePixels(2));
    const reencoded = shared.makeVisualFingerprintFromRgba(_makePixels(2, 1));
    const different = shared.makeVisualFingerprintFromRgba(_makePixels(6));
    expect(original).toEqual(expect.any(String));
    expect(
      shared.areVisualFingerprintsMatching({
        first: original!,
        second: reencoded!,
      }),
    ).toBe(true);
    expect(
      shared.areVisualFingerprintsMatching({
        first: original!,
        second: different!,
      }),
    ).toBe(false);
    expect(
      shared.getVisualFingerprintBandsFromFingerprint(original!),
    ).toHaveLength(4);
    expect(shared.visualFingerprintSchema.safeParse(original).success).toBe(
      true,
    );
  });

  it("does not auto-match featureless images or malformed evidence", () => {
    const blank = Uint8Array.from({ length: 4096 }, (_, index) => {
      return index % 4 === 3 ? 255 : 120;
    });
    expect(shared.makeVisualFingerprintFromRgba(blank)).toBeUndefined();
    expect(
      shared.makeVisualFingerprintFromRgba(new Uint8Array(3)),
    ).toBeUndefined();
    expect(
      shared.areVisualFingerprintsMatching({
        first: "invalid",
        second: "invalid",
      }),
    ).toBe(false);
  });

  it("requires matching color as well as structure", () => {
    const pixels = _makePixels(2);
    const tinted = pixels.map((value, index) => {
      return index % 4 === 0 ? Math.min(255, value + 35) : value;
    });
    expect(
      shared.areVisualFingerprintsMatching({
        first: shared.makeVisualFingerprintFromRgba(pixels)!,
        second: shared.makeVisualFingerprintFromRgba(tinted)!,
      }),
    ).toBe(false);
  });
});
