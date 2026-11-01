import { makeComment, SIGNED_IN } from "@/testing/itemFixtureHelpers";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/** Shared comment for focused local regression scenarios. */
export const comment = makeComment({
  body: "Hi @Jorge",
  commentTags: [
    {
      tagId: "00000000-0000-4000-8000-000000000009",
      memberId: SIGNED_IN.memberId,
      label: "Jorge",
      start: 3,
      end: 9,
    },
  ],
});

/** Shared collection routes for focused local regression scenarios. */
export const collectionRoutes = {
  [`GET /api/member-collections/${SIGNED_IN.memberId}`]: {
    status: 200,
    body: { member: SIGNED_IN },
  },
};

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "audioTracks", "get").mockReturnValue(
    undefined as never,
  );
  vi.spyOn(HTMLMediaElement.prototype, "videoTracks", "get").mockReturnValue(
    undefined as never,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
