import { describe, expect, it } from "vitest";
import {
  getRenditionsFromReadPurpose,
  type RenditionRow,
} from "../../src/media/getRenditionsFromReadPurpose.ts";
function _makeRenditionFromPurpose(
  purpose: RenditionRow["purpose"],
  overrides: Partial<RenditionRow> = {},
): RenditionRow {
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
    const original = _makeRenditionFromPurpose("original", {
      contentType: "video/mp4",
      byteSize: 20 * 1024 * 1024,
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
    const original = _makeRenditionFromPurpose("original", {
      contentType: "video/mp4",
    });
    const mp4 = _makeRenditionFromPurpose("video_mp4", {
      contentType: "video/mp4",
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
    const thumb = _makeRenditionFromPurpose("thumb");
    expect(
      getRenditionsFromReadPurpose({
        rows: [
          _makeRenditionFromPurpose("original", { byteSize: 20 * 1024 * 1024 }),
          _makeRenditionFromPurpose("display", { width: 2048 }),
          thumb,
        ],
        kind: "photo",
        purpose: "thumbnail",
      }),
    ).toEqual([thumb]);
  });
  it("allows an original only within the requested image budget", () => {
    const original = _makeRenditionFromPurpose("original");
    expect(
      getRenditionsFromReadPurpose({
        rows: [original],
        kind: "photo",
        purpose: "thumbnail",
      }),
    ).toEqual([original]);
    for (const incompatible of [
      _makeRenditionFromPurpose("original", { contentType: "image/heic" }),
      _makeRenditionFromPurpose("original", { width: 481 }),
      _makeRenditionFromPurpose("original", { byteSize: 128 * 1024 + 1 }),
    ]) {
      expect(
        getRenditionsFromReadPurpose({
          rows: [incompatible],
          kind: "photo",
          purpose: "thumbnail",
        }),
      ).toEqual([]);
    }
  });
  it("retains a generated preview over its JPEG target while rejecting the same original", () => {
    const thumb = _makeRenditionFromPurpose("thumb", { byteSize: 200 * 1024 });
    const original = _makeRenditionFromPurpose("original", {
      byteSize: 200 * 1024,
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
    const thumb = _makeRenditionFromPurpose("thumb"),
      small = _makeRenditionFromPurpose("display_small", { width: 960 }),
      display = _makeRenditionFromPurpose("display", { width: 2048 }),
      webp = _makeRenditionFromPurpose("display_webp", {
        width: 2048,
        contentType: "image/webp",
      });
    expect(
      getRenditionsFromReadPurpose({
        rows: [
          _makeRenditionFromPurpose("original"),
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
