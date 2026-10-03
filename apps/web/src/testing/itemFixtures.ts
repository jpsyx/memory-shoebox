import type {
  BurstFrameRef,
  BurstSummary,
  CommentDto,
  ItemCapabilities,
  ItemDetail,
  MemberRef,
  ReactionSummary,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtures";

/**
 * Canned item payloads, shared by every test that draws surface 3 or 4, and by
 * the pile's tests for a fanned frame.
 *
 * In `testing/` rather than beside a component, because the item surface's
 * suites and the pile's suites both need them, and a fixture reached across
 * two surface folders is a fixture that belongs to neither. Nothing in the
 * product imports this file.
 */

/** The item every test opens unless it says otherwise. */
export const ITEM_ID = "018f0000-0000-7000-8000-00000000f001";

/** A burst, for the strip. */
export const BURST_ID = "018f0000-0000-7000-8000-00000000b101";

/** A tagged person, so a chip carries a name and an id. */
export const PERSON_MATEO_ID = "018f0000-0000-7000-8000-00000000e101";

/** A person the directory knows and the item does not carry. */
export const PERSON_SOFIA_ID = "018f0000-0000-7000-8000-00000000e102";

/** A person nobody had tagged until a test made her. */
export const PERSON_ELENA_ID = "018f0000-0000-7000-8000-00000000e103";

/** A tag, so a chip carries a name and an id. */
export const TAG_HOSPITAL_ID = "018f0000-0000-7000-8000-00000000e201";

/**
 * The member who put the item up. Not the viewer `createMeResponse` signs in.
 */
export const UPLOADER: MemberRef = {
  memberId: "018f0000-0000-7000-8000-00000000c001",
  displayName: "Mamá",
};

/** The viewer `createMeResponse` signs in by default. */
export const SIGNED_IN: MemberRef = {
  memberId: "018f0000-0000-7000-8000-000000000000",
  displayName: "Papá",
};

/** A rule that lets the signed-in viewer alone see an item. */
export const JUST_ME_VISIBILITY: VisibilitySummary = {
  visibilityRuleId: "018f0000-0000-7000-8000-0000000a0201",
  mode: "only",
  label: "Just me",
  subjects: [
    {
      kind: "member",
      id: SIGNED_IN.memberId,
      displayName: SIGNED_IN.displayName,
    },
  ],
};

/** A summary holding the signed-in viewer's own love, and nobody else's. */
export const LOVED_BY_SIGNED_IN: ReactionSummary = {
  kinds: [{ kind: "love", count: 1, members: [SIGNED_IN] }],
  myKind: "love",
};

/** A viewer: comments and reactions only. */
export const VIEWER_CAPABILITIES: ItemCapabilities = {
  canSetVisibility: false,
  canEditTags: false,
  canEditPeople: false,
  canDescribe: false,
  canFixCaptureDate: false,
  canDelete: false,
  canRequestRemoval: false,
  canSeeViewers: false,
};

/** An uploader looking at somebody else's item: the additive half only. */
export const OTHER_UPLOADER_CAPABILITIES: ItemCapabilities = {
  ...VIEWER_CAPABILITIES,
  canEditTags: true,
  canEditPeople: true,
  canDescribe: true,
};

/** The item's own uploader: everything but asking for it to come down. */
export const OWN_UPLOADER_CAPABILITIES: ItemCapabilities = {
  ...OTHER_UPLOADER_CAPABILITIES,
  canSetVisibility: true,
  canFixCaptureDate: true,
  canDelete: true,
};

/**
 * One photograph, 14 September 2026 at 06:41 on the camera's own clock.
 *
 * `capturedAt` is 04:41 UTC and the file carried `+120`, so the wall clock is
 * 06:41 whatever timezone a test's Shoebox is in.
 */
export function makeItemDetail(
  overrides: Readonly<Partial<ItemDetail>> = {},
): ItemDetail {
  return {
    itemId: ITEM_ID,
    kind: "photo",
    capturedAt: "2026-09-14T04:41:00.000Z",
    capturedOn: "2026-09-14",
    media: {
      thumb: makeMediaSource(),
      display: makeMediaSource({
        url: "https://example.invalid/display.jpg",
        width: 1600,
        height: 1067,
      }),
      poster: null,
      video: null,
      durationMs: null,
      altText: "Mateo, Papá and Mamá, 14 September 2026",
    },
    isUnseen: false,
    uploadedBy: UPLOADER,
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
    tags: [{ tagId: TAG_HOSPITAL_ID, name: "hospital" }],
    people: [{ personId: PERSON_MATEO_ID, displayName: "Mateo" }],
    milestones: [],
    comments: [],
    reactions: { kinds: [], myKind: null },
    capabilities: VIEWER_CAPABILITIES,
    ...overrides,
  };
}

/**
 * One video, 22 seconds long, with both encodings and a poster.
 *
 * Passing `media` in `overrides` replaces the whole media object, video
 * sources and duration included.
 */
export function makeVideoDetail(
  overrides: Readonly<Partial<ItemDetail>> = {},
): ItemDetail {
  const base = makeItemDetail();
  return makeItemDetail({
    kind: "video",
    media: {
      ...base.media,
      poster: makeMediaSource({ url: "https://example.invalid/poster.jpg" }),
      video: {
        webm: makeMediaSource({ url: "https://example.invalid/clip.webm" }),
        mp4: makeMediaSource({ url: "https://example.invalid/clip.mp4" }),
      },
      durationMs: 22_000,
    },
    ...overrides,
  });
}

/** A frame's id, from its 1-based position: dense, so 1 to n. */
export function makeFrameIdFromPosition(position: number): string {
  return `018f0000-0000-7000-8000-0000000f${String(position).padStart(4, "0")}`;
}

/** One frame in the strip. */
export function makeBurstFrame(position: number): BurstFrameRef {
  return {
    itemId: makeFrameIdFromPosition(position),
    position,
    thumb: makeMediaSource({
      url: `https://example.invalid/frame-${position}.jpg`,
    }),
    altText: "Mateo, 14 September 2026",
  };
}

/** A burst of 45 frames between 06:41 and 06:44. */
export function makeBurstSummary(
  overrides: Readonly<Partial<BurstSummary>> = {},
): BurstSummary {
  return {
    burstId: BURST_ID,
    visibleFrameCount: 45,
    startsAt: "2026-09-14T04:41:00.000Z",
    endsAt: "2026-09-14T04:44:00.000Z",
    coverItemId: makeFrameIdFromPosition(1),
    hasUnseenFrames: false,
    ...overrides,
  };
}

/**
 * Frame `position` of a burst of `frameCount`, with the whole run in the
 * strip, and whatever else `overrides` sets on the item.
 *
 * `burstFrames` is capped at sixty by the server, so a `frameCount` over
 * sixty gets the first sixty here too, which is what the strip's fallback is
 * for.
 */
export function makeBurstDetail(
  options: Readonly<{
    position?: number;
    frameCount?: number;
    overrides?: Partial<ItemDetail>;
  }> = {},
): ItemDetail {
  const { position = 7, frameCount = 45, overrides = {} } = options;
  return makeItemDetail({
    itemId: makeFrameIdFromPosition(position),
    burst: makeBurstSummary({ visibleFrameCount: frameCount }),
    burstPosition: position,
    burstFrames: Array.from(
      { length: Math.min(frameCount, 60) },
      (_unused, index) => {
        return makeBurstFrame(index + 1);
      },
    ),
    ...overrides,
  });
}

/** One comment by somebody else, with sensible defaults. */
export function makeComment(
  overrides: Readonly<Partial<CommentDto>> = {},
): CommentDto {
  return {
    commentId: "018f0000-0000-7000-8000-00000000d101",
    author: {
      memberId: "018f0000-0000-7000-8000-00000000c002",
      displayName: "Abuela Rosa",
    },
    body: "He has your father's chin.",
    atSeconds: null,
    createdAt: "2026-09-14T05:00:00.000Z",
    editedAt: null,
    canEdit: false,
    canDelete: false,
    reactions: { kinds: [], myKind: null },
    ...overrides,
  };
}
