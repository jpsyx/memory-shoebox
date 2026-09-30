import { describe, expect, it } from "vitest";
import {
  burstFramesRequestSchema,
  burstFramesResponseSchema,
  itemCapabilitiesSchema,
  itemDetailSchema,
  itemsSeenRequestSchema,
} from "../src/items.ts";

const TAG_ID = "0199c0a0-0000-7000-8000-000000000001";

describe("itemsSeenRequestSchema", () => {
  it("defaults burstIds to none", () => {
    expect(itemsSeenRequestSchema.parse({ itemIds: [TAG_ID] })).toEqual({
      itemIds: [TAG_ID],
      burstIds: [],
    });
  });

  it("refuses more than five hundred ids", () => {
    const itemIds = Array.from({ length: 501 }, () => {
      return TAG_ID;
    });
    expect(itemsSeenRequestSchema.safeParse({ itemIds }).success).toBe(false);
  });

  it("refuses an id that is not a uuid", () => {
    expect(itemsSeenRequestSchema.safeParse({ itemIds: ["7"] }).success).toBe(
      false,
    );
  });
});

const MEDIA_SOURCE = {
  url: "https://b2.test/thumb.jpg",
  expiresAt: "2026-09-27T11:00:00.000Z",
  width: 800,
  height: 600,
};

const CAPABILITIES = {
  canSetVisibility: true,
  canEditTags: true,
  canEditPeople: true,
  canDescribe: true,
  canFixCaptureDate: true,
  canDelete: true,
  canRequestRemoval: false,
  canSeeViewers: false,
};

const ITEM_DETAIL = {
  itemId: "0199a0d4-0000-7000-8000-000000000001",
  kind: "photo",
  capturedAt: "2026-09-14T04:41:00.000Z",
  capturedOn: "2026-09-14",
  media: {
    thumb: MEDIA_SOURCE,
    display: MEDIA_SOURCE,
    poster: null,
    video: null,
    durationMs: null,
    altText: "Mateo and Papá, 14 September 2026",
  },
  isUnseen: false,
  uploadedBy: {
    memberId: "0199a0d4-0000-7000-8000-000000000002",
    displayName: "Papá",
  },
  visibility: {
    visibilityRuleId: "visibility-rule-everyone",
    mode: "everyone",
    label: null,
    subjects: [],
  },
  burst: null,
  captureSource: "exif",
  capturedAtOffsetMinutes: 120,
  originalCapturedAt: "2026-09-14T04:41:00.000Z",
  altTextOverride: null,
  burstPosition: null,
  burstFrames: [],
  tags: [],
  people: [],
  milestones: [],
  comments: [],
  reactions: { kinds: [], myKind: null },
  capabilities: CAPABILITIES,
};

describe("itemDetailSchema", () => {
  it("accepts the whole permalink payload", () => {
    expect(itemDetailSchema.parse(ITEM_DETAIL).capabilities).toEqual(
      CAPABILITIES,
    );
  });

  it("rejects a capability set missing one capability", () => {
    expect(() => {
      return itemCapabilitiesSchema.parse({
        ...CAPABILITIES,
        canSeeViewers: undefined,
      });
    }).toThrow();
  });

  it("rejects a burst position of zero, because the strip is 1-based", () => {
    expect(() => {
      return itemDetailSchema.parse({ ...ITEM_DETAIL, burstPosition: 0 });
    }).toThrow();
  });

  it("rejects a capture source outside the six the column allows", () => {
    expect(() => {
      return itemDetailSchema.parse({ ...ITEM_DETAIL, captureSource: "guess" });
    }).toThrow();
  });

  it("keeps the generated alt text and the override apart", () => {
    const parsed = itemDetailSchema.parse({
      ...ITEM_DETAIL,
      altTextOverride: "Mateo blowing out the candle",
    });

    expect(parsed.altTextOverride).toBe("Mateo blowing out the candle");
    expect(parsed.media.altText).toBe("Mateo and Papá, 14 September 2026");
  });
});

describe("burstFramesResponseSchema", () => {
  it("carries dense 1-based positions and an end-of-list cursor", () => {
    const parsed = burstFramesResponseSchema.parse({
      frames: [
        {
          itemId: "0199a0d4-0000-7000-8000-000000000003",
          position: 1,
          thumb: MEDIA_SOURCE,
          altText: "14 September 2026",
        },
      ],
      nextCursor: null,
    });

    expect(parsed.frames[0]?.position).toBe(1);
    expect(parsed.nextCursor).toBeNull();
  });

  it("caps the frames limit at 200", () => {
    expect(() => {
      return burstFramesRequestSchema.parse({ limit: 201 });
    }).toThrow();
  });
});
