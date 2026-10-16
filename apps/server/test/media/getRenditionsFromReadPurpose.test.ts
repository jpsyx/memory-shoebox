import { describe, expect, it } from "vitest";
import {
  getRenditionsFromReadPurpose,
  type RenditionRow,
} from "../../src/media/getRenditionsFromReadPurpose.ts";
function _makeRenditionFromPurpose({
  purpose,
  overrides = {},
}: {
  purpose: RenditionRow["purpose"];
  overrides?: Partial<RenditionRow>;
}): RenditionRow {
  return {
    renditionId: purpose,
    purpose,
    storageKey: `items/${purpose}`,
    contentType: "image/jpeg",
    byteSize: 100 * 1024,
    width: 400,
    height: 300,
    ...overrides,
  };
}
describe("getRenditionsFromReadPurpose", () => {
  it("restricts original video fallback to the selected view", () => {
    const original = _makeRenditionFromPurpose({
      purpose: "original",
      overrides: {
        contentType: "video/mp4",
        byteSize: 20 * 1024 * 1024,
      },
    });
    expect(
      getRenditionsFromReadPurpose({
        rows: [original],
        kind: "video",
        purpose: "thumbnail",
      }),
    ).toEqual([]);
    expect(
      getRenditionsFromReadPurpose({
        rows: [original],
        kind: "video",
        purpose: "speculative-preview",
      }),
    ).toEqual([]);
    expect(
      getRenditionsFromReadPurpose({
        rows: [original],
        kind: "video",
        purpose: "selected-view",
      }),
    ).toEqual([original]);
  });
  it("chooses optimized playback instead of signing the original", () => {
    const original = _makeRenditionFromPurpose({
      purpose: "original",
      overrides: {
        contentType: "video/mp4",
      },
    });
    const mp4 = _makeRenditionFromPurpose({
      purpose: "video_mp4",
      overrides: {
        contentType: "video/mp4",
      },
    });
    expect(
      getRenditionsFromReadPurpose({
        rows: [original, mp4],
        kind: "video",
        purpose: "selected-view",
      }),
    ).toEqual([mp4]);
    expect(
      getRenditionsFromReadPurpose({
        rows: [original, mp4],
        kind: "video",
        purpose: "speculative-preview",
      }),
    ).toEqual([mp4]);
  });
  it("does not sign unused displays or oversized originals for a thumbnail", () => {
    const thumb = _makeRenditionFromPurpose({ purpose: "thumb" });
    expect(
      getRenditionsFromReadPurpose({
        rows: [
          _makeRenditionFromPurpose({
            purpose: "original",
            overrides: { byteSize: 20 * 1024 * 1024 },
          }),
          _makeRenditionFromPurpose({
            purpose: "display",
            overrides: { width: 2048 },
          }),
          thumb,
        ],
        kind: "photo",
        purpose: "thumbnail",
      }),
    ).toEqual([thumb]);
  });
  it("allows an original only within the requested image budget", () => {
    const original = _makeRenditionFromPurpose({ purpose: "original" });
    expect(
      getRenditionsFromReadPurpose({
        rows: [original],
        kind: "photo",
        purpose: "thumbnail",
      }),
    ).toEqual([original]);
    [
      _makeRenditionFromPurpose({
        purpose: "original",
        overrides: { contentType: "image/heic" },
      }),
      _makeRenditionFromPurpose({
        purpose: "original",
        overrides: { width: 481 },
      }),
      _makeRenditionFromPurpose({
        purpose: "original",
        overrides: { byteSize: 128 * 1024 + 1 },
      }),
    ].forEach((incompatible) => {
      expect(
        getRenditionsFromReadPurpose({
          rows: [incompatible],
          kind: "photo",
          purpose: "thumbnail",
        }),
      ).toEqual([]);
    });
  });
  it("retains a generated preview over its JPEG target while rejecting the same original", () => {
    const thumb = _makeRenditionFromPurpose({
      purpose: "thumb",
      overrides: { byteSize: 200 * 1024 },
    });
    const original = _makeRenditionFromPurpose({
      purpose: "original",
      overrides: {
        byteSize: 200 * 1024,
      },
    });
    expect(
      getRenditionsFromReadPurpose({
        rows: [thumb],
        kind: "photo",
        purpose: "thumbnail",
      }),
    ).toEqual([thumb]);
    expect(
      getRenditionsFromReadPurpose({
        rows: [original],
        kind: "photo",
        purpose: "thumbnail",
      }),
    ).toEqual([]);
  });
  it("returns display candidates and JPEG fallback for a selected photo", () => {
    const thumb = _makeRenditionFromPurpose({ purpose: "thumb" }),
      small = _makeRenditionFromPurpose({
        purpose: "display_small",
        overrides: { width: 960 },
      }),
      display = _makeRenditionFromPurpose({
        purpose: "display",
        overrides: { width: 2048 },
      }),
      webp = _makeRenditionFromPurpose({
        purpose: "display_webp",
        overrides: {
          width: 2048,
          contentType: "image/webp",
        },
      });
    expect(
      getRenditionsFromReadPurpose({
        rows: [
          _makeRenditionFromPurpose({ purpose: "original" }),
          thumb,
          small,
          display,
          webp,
        ],
        kind: "photo",
        purpose: "selected-view",
      }),
    ).toEqual([thumb, small, display, webp]);
  });
});
