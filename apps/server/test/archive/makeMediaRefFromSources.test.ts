import { describe, expect, it } from "vitest";
import type { MediaSource } from "@memory-shoebox/shared";
import { makeMediaRefFromSources } from "../../src/archive/makeMediaRefFromSources.ts";

const makeSource = (url: string): MediaSource => {
  return {
    url,
    expiresAt: "2026-09-27T11:00:00.000Z",
    width: 800,
    height: 600,
  };
};

describe("makeMediaRefFromSources", () => {
  it("builds a photograph from a thumbnail and a display copy", () => {
    const media = makeMediaRefFromSources({
      sources: new Map([
        ["thumb", makeSource("https://b2.test/thumb")],
        ["display", makeSource("https://b2.test/display")],
      ]),
      durationMs: null,
      altText: "14 September 2026",
    });

    expect(media).toEqual({
      thumb: makeSource("https://b2.test/thumb"),
      display: makeSource("https://b2.test/display"),
      poster: null,
      video: null,
      durationMs: null,
      altText: "14 September 2026",
    });
  });

  it("falls back through display and the original when one is missing", () => {
    const media = makeMediaRefFromSources({
      sources: new Map([["original", makeSource("https://b2.test/original")]]),
      durationMs: null,
      altText: "14 September 2026",
    });

    expect(media?.thumb.url).toBe("https://b2.test/original");
    expect(media?.display.url).toBe("https://b2.test/original");
  });

  it("carries a video's poster and both transcodes", () => {
    const media = makeMediaRefFromSources({
      sources: new Map([
        ["thumb", makeSource("https://b2.test/thumb")],
        ["display", makeSource("https://b2.test/display")],
        ["poster", makeSource("https://b2.test/poster")],
        ["video_mp4", makeSource("https://b2.test/mp4")],
      ]),
      durationMs: 22_000,
      altText: "A clip",
    });

    expect(media?.poster?.url).toBe("https://b2.test/poster");
    expect(media?.video).toEqual({
      webm: null,
      mp4: makeSource("https://b2.test/mp4"),
    });
    expect(media?.durationMs).toBe(22_000);
  });

  it("returns nothing for an item with no renditions at all", () => {
    expect(
      makeMediaRefFromSources({
        sources: new Map(),
        durationMs: null,
        altText: "14 September 2026",
      }),
    ).toBeUndefined();
  });
});
