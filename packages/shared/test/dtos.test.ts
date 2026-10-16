import { describe, expect, it } from "vitest";
import { calendarDateSchema } from "../src/index.ts";
import * as dtos from "../src/dtos.ts";
import {
  burstSummarySchema,
  commentDtoSchema,
  itemSummarySchema,
  type MediaRef,
  mediaRefSchema,
  mediaSourceSchema,
  reactionKindSchema,
  visibilitySummarySchema,
} from "../src/dtos.ts";

/** A valid `MediaSource`, which every other fixture here is built from. */
const MEDIA_SOURCE = {
  issuedAt: "2026-09-27T10:00:00.000Z",
  renditionId: "fixture-source",
  purpose: "thumb" as const,
  contentType: "image/jpeg",
  byteSize: 100_000,
  url: "https://shoebox.example.com/media/6b1f?sig=Kz9s&exp=1790000000",
  expiresAt: "2026-09-27T15:03:11.412Z",
  width: 1600,
  height: 1200,
} satisfies dtos.MediaSource;

/** A photograph: no poster, no video, no duration. */
const PHOTOGRAPH: MediaRef = {
  width: 1600,
  height: 1200,
  previewState: "ready" as const,
  displayCandidates: [],
  thumb: MEDIA_SOURCE,
  display: MEDIA_SOURCE,
  poster: null,
  playback: null,
  durationMs: null,
  altText: "Two children on a beach at dusk.",
};

/** The same shape carrying a video instead. */
const VIDEO: MediaRef = {
  width: 1600,
  height: 1200,
  previewState: "ready" as const,
  displayCandidates: [],
  thumb: MEDIA_SOURCE,
  display: MEDIA_SOURCE,
  poster: MEDIA_SOURCE,
  playback: {
    ...MEDIA_SOURCE,
    purpose: "video_mp4" as const,
    contentType: "video/mp4",
  },
  durationMs: 12_480,
  altText: "A dog running through a sprinkler.",
};

/** A member reference, reused by the item and comment fixtures. */
const UPLOADED_BY = {
  memberId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f901234",
  displayName: "Abuela Rosa",
} satisfies dtos.MemberRef;

/** A `BurstSummary`, reused by the item fixture and the burst schema tests. */
const BURST = {
  burstId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f909abc",
  visibleFrameCount: 7,
  startsAt: "2026-08-14T18:22:05.000Z",
  endsAt: "2026-08-14T18:22:09.000Z",
  coverItemId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678",
  hasUnseenFrames: true,
} satisfies dtos.BurstSummary;

/** A full `ItemSummary`, which exercises the composition of four DTOs. */
const ITEM_SUMMARY = {
  itemId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678",
  kind: "photo",
  capturedAt: "2026-08-14T18:22:05.000Z",
  capturedOn: "2026-08-14",
  media: PHOTOGRAPH,
  isUnseen: true,
  uploadedBy: UPLOADED_BY,
  visibility: {
    visibilityRuleId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f90aaaa",
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
  burst: BURST,
} satisfies dtos.ItemSummary;

/** A full `CommentDto`, which carries a `ReactionSummary`. */
const COMMENT_DTO = {
  parentCommentId: null,
  commentId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f90def0",
  author: UPLOADED_BY,
  body: "She never did let go of that shovel.",
  atSeconds: null,
  createdAt: "2026-09-01T09:14:00.000Z",
  editedAt: null,
  canEdit: true,
  canDelete: false,
  reactions: {
    kinds: [{ kind: "love", count: 2, members: [UPLOADED_BY] }],
    myKind: "love",
  },
} satisfies dtos.CommentDto;

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
  it("preserves a photograph with null poster and playback", () => {
    expect(mediaRefSchema.parse(PHOTOGRAPH)).toEqual(PHOTOGRAPH);
  });

  it("preserves a video and its media sources", () => {
    expect(mediaRefSchema.parse(VIDEO)).toEqual(VIDEO);
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
        mediaSourceSchema.safeParse({ ...MEDIA_SOURCE, url: key }).success,
      ).toBe(false);
      expect(
        mediaRefSchema.safeParse({
          ...PHOTOGRAPH,
          thumb: { ...MEDIA_SOURCE, url: key },
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
      expect(
        mediaSourceSchema.safeParse({ ...MEDIA_SOURCE, url }).success,
      ).toBe(false);
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
        mediaSourceSchema.safeParse({ ...MEDIA_SOURCE, expiresAt: when })
          .success,
      ).toBe(false);
    });
  });
});

describe("itemSummarySchema", () => {
  it("preserves an item with its media, visibility and burst", () => {
    expect(itemSummarySchema.parse(ITEM_SUMMARY)).toEqual(ITEM_SUMMARY);
  });

  it("accepts an item with no burst", () => {
    expect(
      itemSummarySchema.safeParse({ ...ITEM_SUMMARY, burst: null }).success,
    ).toBe(true);
  });

  it("rejects a formatted date in place of a capture timestamp or calendar date", () => {
    expect(
      itemSummarySchema.safeParse({
        ...ITEM_SUMMARY,
        capturedAt: "14 August 2026",
      }).success,
    ).toBe(false);
    expect(
      itemSummarySchema.safeParse({ ...ITEM_SUMMARY, capturedOn: "14/08/2026" })
        .success,
    ).toBe(false);
    expect(
      itemSummarySchema.safeParse({
        ...ITEM_SUMMARY,
        capturedOn: "2026-08-14T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("commentDtoSchema", () => {
  it("preserves a comment and its reaction summary", () => {
    expect(commentDtoSchema.parse(COMMENT_DTO)).toEqual(COMMENT_DTO);
  });

  it("requires editedAt rather than allowing it to be absent", () => {
    // The "edited" marker is driven by an explicit null, not by a
    // missing key, so the two halves cannot disagree about what absence means.
    const { editedAt: _editedAt, ...withoutEditedAt } = COMMENT_DTO;
    expect(commentDtoSchema.safeParse(withoutEditedAt).success).toBe(false);
  });

  it("rejects a reaction kind outside the frozen enum", () => {
    expect(
      commentDtoSchema.safeParse({
        ...COMMENT_DTO,
        reactions: { ...COMMENT_DTO.reactions, myKind: "angry" },
      }).success,
    ).toBe(false);
  });
});

describe("burstSummarySchema", () => {
  it("accepts a stack that says whether any frame is unseen", () => {
    expect(burstSummarySchema.parse(BURST)).toEqual(BURST);
  });

  it("rejects a stack with no hasUnseenFrames, which the latch needs", () => {
    const { hasUnseenFrames: _unused, ...withoutFlag } = BURST;
    expect(burstSummarySchema.safeParse(withoutFlag).success).toBe(false);
  });
});

describe("visibilitySummarySchema", () => {
  it("carries the rule id, which is not required to be a uuid", () => {
    const parsed = visibilitySummarySchema.parse({
      visibilityRuleId: "visibility-rule-everyone",
      mode: "everyone",
      label: null,
      subjects: [],
    });

    expect(parsed.visibilityRuleId).toBe("visibility-rule-everyone");
  });

  it("rejects a summary with no rule id", () => {
    expect(() => {
      return visibilitySummarySchema.parse({
        mode: "everyone",
        label: null,
        subjects: [],
      });
    }).toThrow();
  });

  it("rejects an empty rule id, which is what min(1) is there for", () => {
    expect(() => {
      return visibilitySummarySchema.parse({
        visibilityRuleId: "",
        mode: "everyone",
        label: null,
        subjects: [],
      });
    }).toThrow();
  });
});

describe("calendarDateSchema", () => {
  it("accepts leap days and rejects impossible calendar dates", () => {
    ["2024-02-29", "2000-02-29", "2026-09-30"].forEach((date) => {
      expect(calendarDateSchema.safeParse(date).success).toBe(true);
    });
    [
      "2026-02-29",
      "1900-02-29",
      "2026-02-30",
      "2026-04-31",
      "2026-13-01",
      "2026-00-01",
      "2026-09-00",
    ].forEach((date) => {
      expect(calendarDateSchema.safeParse(date).success).toBe(false);
    });
  });
});
