import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtureHelpers";
import { describe, expect, it } from "vitest";
import { getPhotoCandidateFromViewport } from "./getPhotoCandidateFromViewport";

const candidates = [480, 960, 2048].map((width) => {
  return makeMediaSource({
    width,
    height: width * 0.75,
    byteSize: width * 100,
    renditionId: `jpeg-${width}`,
  });
});

describe("responsive photo selection", () => {
  it.each([
    [300, 1, 480],
    [600, 1, 960],
    [600, 2, 2048],
    [4000, 2, 2048],
  ])(
    "fits %s CSS pixels at DPR %s without upscaling beyond the archive",
    (cssWidth, devicePixelRatio, width) => {
      const source = getPhotoCandidateFromViewport({
        candidates,
        cssWidth,
        cssHeight: 3000,
        devicePixelRatio,
        supportsWebp: false,
      });
      expect(source?.width).toBe(width);
      expect(source?.byteSize).toBe(width * 100);
    },
  );
  it("fits portrait height before multiplying DPR", () => {
    const portrait = candidates.map((source) => {
      return { ...source, width: source.height, height: source.width };
    });
    expect(
      getPhotoCandidateFromViewport({
        candidates: portrait,
        cssWidth: 900,
        cssHeight: 450,
        devicePixelRatio: 2,
        supportsWebp: false,
      })?.height,
    ).toBe(960);
  });
  it("uses a supported smaller WebP representation of the matching size", () => {
    const webp = makeMediaSource({
      ...candidates[1]!,
      renditionId: "webp-960",
      contentType: "image/webp",
      byteSize: 100,
    });
    const options = {
      candidates: [...candidates, webp],
      cssWidth: 600,
      cssHeight: 900,
      devicePixelRatio: 1,
    };
    expect(
      getPhotoCandidateFromViewport({ ...options, supportsWebp: true })
        ?.renditionId,
    ).toBe("webp-960");
    expect(
      getPhotoCandidateFromViewport({ ...options, supportsWebp: false })
        ?.renditionId,
    ).toBe("jpeg-960");
  });
  it("does not select unusable or non-image sources", () => {
    expect(
      getPhotoCandidateFromViewport({
        candidates: [
          makeMediaSource({ width: 0 }),
          makeMediaSource({ contentType: "video/mp4" }),
        ],
        cssWidth: 500,
        cssHeight: 500,
        devicePixelRatio: 1,
        supportsWebp: true,
      }),
    ).toBeUndefined();
  });
});

it.each([
  ["image/jpeg", false, false, true],
  ["image/png", false, false, true],
  ["image/gif", false, false, true],
  ["image/webp", false, false, false],
  ["image/webp", true, false, true],
  ["image/avif", true, false, false],
  ["image/avif", false, true, true],
  ["image/heic", true, true, false],
])(
  "selects %s only with its declared capability",
  (contentType, supportsWebp, supportsAvif, admitted) => {
    const source = makeMediaSource({ contentType: String(contentType) });
    expect(
      getPhotoCandidateFromViewport({
        candidates: [source],
        cssWidth: 600,
        cssHeight: 900,
        devicePixelRatio: 1,
        supportsWebp: Boolean(supportsWebp),
        supportsAvif: Boolean(supportsAvif),
      }),
    ).toEqual(admitted ? source : undefined);
  },
);
