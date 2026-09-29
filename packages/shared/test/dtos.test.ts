import { describe, expect, it } from "vitest";
import * as contract from "../src/index.ts";
import * as dtos from "../src/dtos.ts";
import {
  burstSummarySchema,
  commentDtoSchema,
  itemSummarySchema,
  type MediaRef,
  mediaRefSchema,
  mediaSourceSchema,
  reactionKindSchema,
} from "../src/dtos.ts";

/** A valid `MediaSource`, which every other fixture here is built from. */
const mediaSource = {
  url: "https://shoebox.example.com/media/6b1f?sig=Kz9s&exp=1790000000",
  expiresAt: "2026-09-27T15:03:11.412Z",
  width: 1600,
  height: 1200,
};

/** A photograph: no poster, no video, no duration. */
const photograph: MediaRef = {
  thumb: mediaSource,
  display: mediaSource,
  poster: null,
  video: null,
  durationMs: null,
  altText: "Two children on a beach at dusk.",
};

/** The same shape carrying a video instead. */
const video: MediaRef = {
  thumb: mediaSource,
  display: mediaSource,
  poster: mediaSource,
  video: { webm: mediaSource, mp4: mediaSource },
  durationMs: 12_480,
  altText: "A dog running through a sprinkler.",
};

/** A member reference, reused by the item and comment fixtures. */
const uploadedBy = {
  memberId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f901234",
  displayName: "Abuela Rosa",
};

/** A `BurstSummary`, reused by the item fixture and the burst schema tests. */
const burst = {
  burstId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f909abc",
  visibleFrameCount: 7,
  startsAt: "2026-08-14T18:22:05.000Z",
  endsAt: "2026-08-14T18:22:09.000Z",
  coverItemId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678",
  hasUnseenFrames: true,
};

/** A full `ItemSummary`, which exercises the composition of four DTOs. */
const itemSummary = {
  itemId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678",
  kind: "photo",
  capturedAt: "2026-08-14T18:22:05.000Z",
  capturedOn: "2026-08-14",
  media: photograph,
  isUnseen: true,
  uploadedBy,
  visibility: {
    mode: "only",
    label: "Just us two",
    subjects: [
      {
        kind: "member",
        id: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f901234",
        displayName: "Abuela Rosa",
      },
    ],
  },
  burst,
};

/** A full `CommentDto`, which carries a `ReactionSummary`. */
const commentDto = {
  commentId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f90def0",
  author: uploadedBy,
  body: "She never did let go of that shovel.",
  atSeconds: null,
  createdAt: "2026-09-01T09:14:00.000Z",
  editedAt: null,
  canEdit: true,
  canDelete: false,
  reactions: {
    kinds: [{ kind: "love", count: 2, members: [uploadedBy] }],
    myKind: "love",
  },
};

describe("reactionKindSchema", () => {
  it("accepts the six kinds and nothing else", () => {
    ["like", "love", "care", "haha", "wow", "sad"].forEach((kind) => {
      expect(reactionKindSchema.safeParse(kind).success).toBe(true);
    });
    expect(reactionKindSchema.safeParse("angry").success).toBe(false);
    expect(reactionKindSchema.safeParse("").success).toBe(false);
  });
});

describe("mediaRefSchema", () => {
  it("parses a photograph, whose poster and video are null", () => {
    expect(mediaRefSchema.parse(photograph)).toEqual(photograph);
  });

  it("parses a video through the same shape", () => {
    expect(mediaRefSchema.parse(video)).toEqual(video);
  });

  it("rejects a storage key in place of a url", () => {
    // `conventions.md` § Forbidden in any payload: a raw storage key is never
    // a url. None of these is absolute, so none can be a signed URL.
    [
      "items/4620/thumb.jpg",
      "/items/4620/thumb.jpg",
      "items/4620/thumb.jpg?sig=abc",
      "thumb.jpg",
    ].forEach((key) => {
      expect(
        mediaSourceSchema.safeParse({ ...mediaSource, url: key }).success,
      ).toBe(false);
      expect(
        mediaRefSchema.safeParse({
          ...photograph,
          thumb: { ...mediaSource, url: key },
        }).success,
      ).toBe(false);
    });
  });

  it("rejects a url that is absolute but not fetchable over http", () => {
    [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "file:///tmp/a.jpg",
    ].forEach((url) => {
      expect(mediaSourceSchema.safeParse({ ...mediaSource, url }).success).toBe(
        false,
      );
    });
  });

  it("rejects a formatted or relative date in place of an expiry timestamp", () => {
    [
      "27 September 2026, 15:03",
      "in 2 hours",
      "tomorrow",
      "2026-09-27T15:03:11Z",
      "2026-09-27T15:03:11.412+01:00",
    ].forEach((when) => {
      expect(
        mediaSourceSchema.safeParse({ ...mediaSource, expiresAt: when })
          .success,
      ).toBe(false);
    });
  });
});

describe("itemSummarySchema", () => {
  it("parses an item composed of a media ref, a visibility summary and a burst", () => {
    expect(itemSummarySchema.parse(itemSummary)).toEqual(itemSummary);
  });

  it("parses an item with no burst", () => {
    expect(
      itemSummarySchema.safeParse({ ...itemSummary, burst: null }).success,
    ).toBe(true);
  });

  it("rejects a formatted date in place of a capture timestamp or calendar date", () => {
    expect(
      itemSummarySchema.safeParse({
        ...itemSummary,
        capturedAt: "14 August 2026",
      }).success,
    ).toBe(false);
    expect(
      itemSummarySchema.safeParse({ ...itemSummary, capturedOn: "14/08/2026" })
        .success,
    ).toBe(false);
    expect(
      itemSummarySchema.safeParse({
        ...itemSummary,
        capturedOn: "2026-08-14T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("commentDtoSchema", () => {
  it("parses a comment carrying a reaction summary", () => {
    expect(commentDtoSchema.parse(commentDto)).toEqual(commentDto);
  });

  it("requires editedAt rather than allowing it to be absent", () => {
    // Decision 8: the "edited" marker is driven by an explicit null, not by a
    // missing key, so the two halves cannot disagree about what absence means.
    const { editedAt: _editedAt, ...withoutEditedAt } = commentDto;
    expect(commentDtoSchema.safeParse(withoutEditedAt).success).toBe(false);
  });

  it("rejects a reaction kind outside the frozen enum", () => {
    expect(
      commentDtoSchema.safeParse({
        ...commentDto,
        reactions: { ...commentDto.reactions, myKind: "angry" },
      }).success,
    ).toBe(false);
  });
});

describe("the barrel", () => {
  it("re-exports exactly the twelve frozen DTO schemas", () => {
    // The count is the point: a list quietly missing `TagRef` or
    // `ReactionSummary` leaves a slice free to redefine one, and a slice that
    // redefines one has forked the contract. So the set is derived from what
    // `dtos.ts` actually exports rather than asserted against itself: a
    // thirteenth DTO that nobody adds here fails, and a deleted one fails too.
    const frozen = [
      "reactionKindSchema",
      "mediaSourceSchema",
      "mediaRefSchema",
      "memberRefSchema",
      "personRefSchema",
      "tagRefSchema",
      "milestoneRefSchema",
      "visibilitySummarySchema",
      "burstSummarySchema",
      "itemSummarySchema",
      "reactionSummarySchema",
      "commentDtoSchema",
    ];

    // The four primitives the frozen shapes are built from. Exported, and part
    // of the contract, but not themselves DTOs.
    const primitives = [
      "idSchema",
      "timestampSchema",
      "calendarDateSchema",
      "signedUrlSchema",
    ];

    const exported = Object.keys(dtos).filter((name) => {
      return name.endsWith("Schema") && !primitives.includes(name);
    });
    expect(exported.sort()).toEqual([...frozen].sort());
    expect(frozen).toHaveLength(12);

    [...frozen, ...primitives].forEach((name) => {
      expect(contract).toHaveProperty(name);
    });
  });
});

describe("burstSummarySchema", () => {
  it("accepts a stack that says whether any frame is unseen", () => {
    expect(burstSummarySchema.parse(burst)).toEqual(burst);
  });

  it("rejects a stack with no hasUnseenFrames, which the latch needs", () => {
    const { hasUnseenFrames: _unused, ...withoutFlag } = burst;
    expect(burstSummarySchema.safeParse(withoutFlag).success).toBe(false);
  });
});
