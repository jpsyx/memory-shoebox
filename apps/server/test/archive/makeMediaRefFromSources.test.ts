import type { MediaSource } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { makeMediaRefFromSources } from "../../src/archive/makeMediaRefFromSources.ts";

function _makeMediaSourceFromOverrides(
  overrides: Partial<MediaSource> = {},
): MediaSource {
  return {
    renditionId: "rendition-1",
    purpose: "thumb",
    contentType: "image/jpeg",
    byteSize: 100 * 1024,
    issuedAt: "2026-09-27T10:00:00.000Z",
    url: "https://b2.test/thumb",
    expiresAt: "2026-09-27T11:00:00.000Z",
    width: 400,
    height: 300,
    ...overrides,
  };
}
const photo = {
  kind: "photo" as const,
  width: 4000,
  height: 3000,
  previewState: "unavailable" as const,
  durationMs: null,
  altText: "A photograph",
};

describe("makeMediaRefFromSources", () => {
  it("never turns original video into an image", () => {
    const original = _makeMediaSourceFromOverrides({
      purpose: "original",
      contentType: "video/mp4",
    });
    const ref = makeMediaRefFromSources({
      ...photo,
      kind: "video",
      sources: new Map([["original", original]]),
    });
    expect(ref.thumb).toBeNull();
    expect(ref.display).toBeNull();
    expect(ref.playback?.purpose).toBe("original");
  });
  it("rejects a large original preview", () => {
    const original = _makeMediaSourceFromOverrides({
      purpose: "original",
      byteSize: 20 * 1024 * 1024,
      width: 4000,
      height: 3000,
    });
    const ref = makeMediaRefFromSources({
      ...photo,
      sources: new Map([["original", original]]),
    });
    expect(ref.thumb).toBeNull();
    expect(ref.display).toBeNull();
  });
  it("allows a compatible small original to substitute", () => {
    const original = _makeMediaSourceFromOverrides({ purpose: "original" });
    const ref = makeMediaRefFromSources({
      ...photo,
      sources: new Map([["original", original]]),
    });
    expect(ref.thumb).toEqual(original);
    expect(ref.display).toEqual(original);
    expect(ref.previewState).toBe("ready");
  });
  it("preserves catalog layout and unavailable state without renditions", () => {
    const ref = makeMediaRefFromSources({ ...photo, sources: new Map() });
    const { kind: _kind, ...layout } = photo;
    expect(ref).toEqual({
      ...layout,
      thumb: null,
      display: null,
      displayCandidates: [],
      poster: null,
      playback: null,
    });
  });
  it("keeps pending explicit when no rendition is ready", () => {
    expect(
      makeMediaRefFromSources({
        ...photo,
        previewState: "pending",
        sources: new Map(),
      }).previewState,
    ).toBe("pending");
  });
  it("retains JPEG display fallback alongside economical candidates", () => {
    const jpeg = _makeMediaSourceFromOverrides({
      purpose: "display",
      width: 2048,
      height: 1536,
    });
    const webp = _makeMediaSourceFromOverrides({
      purpose: "display_small_webp",
      contentType: "image/webp",
      width: 960,
      height: 720,
    });
    const ref = makeMediaRefFromSources({
      ...photo,
      sources: new Map([
        ["display", jpeg],
        ["display_small_webp", webp],
      ]),
    });
    expect(ref.display).toEqual(jpeg);
    expect(ref.displayCandidates).toEqual([webp, jpeg]);
    expect(ref.thumb).toBeNull();
  });
});
