import { makeItemDetail, makeVideoDetail } from "@/testing/itemFixtureHelpers";
import type { MediaPreview } from "@memory-shoebox/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPrefetchCandidatesFromNeighbors,
  getPrefetchCostsFromCandidate,
  getPrefetchEnvironmentFromBrowser,
} from "./mediaPrefetchPolicy";

function _preview(itemId: string, kind = "photo"): MediaPreview {
  const detail =
    kind === "photo" ? makeItemDetail({ itemId }) : makeVideoDetail({ itemId });
  return {
    itemId,
    kind: detail.kind,
    width: detail.media.width,
    height: detail.media.height,
    media: detail.media,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("direction-aware speculative policy", () => {
  it("preserves direction order and uses exactly the viewer-selected rendition", () => {
    const neighbors = {
      ahead: [_preview("first"), _preview("second")],
      behind: [_preview("behind")],
    };
    const candidates = getPrefetchCandidatesFromNeighbors({
      neighbors,
      selectPhotoSource: (preview) => {
        return preview.media.thumb ?? undefined;
      },
    });
    expect(
      candidates.map((candidate) => {
        return [candidate.itemId, candidate.rank, candidate.decode];
      }),
    ).toEqual([
      ["first", 0, true],
      ["second", 1, false],
      ["behind", 2, false],
    ]);
    expect(candidates[0]!.source).toBe(neighbors.ahead[0]!.media.thumb);
    expect(getPrefetchCostsFromCandidate(candidates[0]!)).toEqual({
      encodedBytes: neighbors.ahead[0]!.media.thumb!.byteSize,
      decodedBytes: 400 * 267 * 4,
    });
  });

  it("does not promote a behind-only photo into the immediate-forward slot", () => {
    const candidates = getPrefetchCandidatesFromNeighbors({
      neighbors: { ahead: [], behind: [_preview("behind")] },
      selectPhotoSource: (preview) => {
        return preview.media.display ?? undefined;
      },
    });
    expect(
      candidates.map((candidate) => {
        return [candidate.rank, candidate.decode];
      }),
    ).toEqual([[2, false]]);
  });

  it("warms video posters, skips missing photos and never selects original playback", () => {
    const video = _preview("video", "video");
    const missing = _preview("missing");
    const candidates = getPrefetchCandidatesFromNeighbors({
      neighbors: { ahead: [video, missing], behind: [] },
      selectPhotoSource: () => {
        return undefined;
      },
    });
    expect(
      candidates.map((candidate) => {
        return [candidate.kind, candidate.decode];
      }),
    ).toEqual([["poster", false]]);
    expect(candidates[0]!.source).toBe(video.media.poster);
  });

  it("uses unknown when Network Information is unavailable and reflects visibility", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    expect(
      getPrefetchEnvironmentFromBrowser({
        memberId: "member",
        selectionKey: "selected",
      }),
    ).toEqual({
      memberId: "member",
      selectionKey: "selected",
      visible: false,
      saveData: false,
      effectiveType: "unknown",
    });
  });
});
