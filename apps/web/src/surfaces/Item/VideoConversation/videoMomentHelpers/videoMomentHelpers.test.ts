import { describe, expect, it } from "vitest";
import {
  getCrossedReactions,
  makeMomentGroupsFromEvents,
} from "./videoMomentHelpers";
import { makeComment, SIGNED_IN } from "@/testing/itemFixtureHelpers";
const REACTION = {
  reactionId: "r1",
  author: SIGNED_IN,
  emoji: "😂" as const,
  atSeconds: 4,
  createdAt: "2026-09-14T05:00:00.000Z",
  canDelete: true,
};
describe("video moments", () => {
  it("keeps wide grouped labels apart even near the clamped rail edges", () => {
    const reactions = [0, 0.1, 5.6, 5.7].map((atSeconds, index) => {
      return { ...REACTION, reactionId: `r${index}`, atSeconds };
    });
    expect(
      makeMomentGroupsFromEvents({
        comments: [],
        reactions,
        duration: 30,
        width: 300,
      }),
    ).toHaveLength(1);
  });

  it("groups markers by available width on phones", () => {
    const groups = makeMomentGroupsFromEvents({
      comments: [makeComment({ atSeconds: 6 }), makeComment({ atSeconds: 7 })],
      reactions: [],
      duration: 10,
      width: 300,
    });
    expect(groups).toHaveLength(1);
  });

  it("groups close moments and excludes replies and whole-video comments", () => {
    const parent = makeComment({ atSeconds: 4.1 });
    const groups = makeMomentGroupsFromEvents({
      comments: [
        parent,
        makeComment({ parentCommentId: parent.commentId, atSeconds: 4.1 }),
        makeComment(),
      ],
      reactions: [REACTION],
      duration: 22,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.moments).toHaveLength(2);
  });
  it("animates playback crossings, but never seeking or backwards updates", () => {
    expect(
      getCrossedReactions({
        reactions: [REACTION],
        previousTime: 3.9,
        currentTime: 4.2,
        isSeeking: false,
      }),
    ).toEqual([REACTION]);
    expect(
      getCrossedReactions({
        reactions: [REACTION],
        previousTime: 0,
        currentTime: 10,
        isSeeking: true,
      }),
    ).toEqual([]);
    expect(
      getCrossedReactions({
        reactions: [REACTION],
        previousTime: 8,
        currentTime: 2,
        isSeeking: false,
      }),
    ).toEqual([]);
  });
});
