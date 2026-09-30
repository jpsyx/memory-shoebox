import { z } from "zod";
import {
  commentDtoSchema,
  idSchema,
  itemSummarySchema,
  mediaSourceSchema,
  milestoneRefSchema,
  personRefSchema,
  reactionSummarySchema,
  tagRefSchema,
  timestampSchema,
  type ReactionKind,
} from "./dtos.ts";
import { LIMITS } from "./limits.ts";

/**
 * The item slice's request and response schemas: `tech-specs/apis/items.md`.
 */

/**
 * What the viewer has had on screen.
 *
 * The route answers `204` and reports nothing about these ids. An id that does
 * not exist and an id the viewer's predicate excludes are both silently
 * ignored: per-id feedback of any kind, even a count of rows written, would
 * turn a batch endpoint into a visibility oracle.
 */
export const itemsSeenRequestSchema = z.object({
  /** Items the viewer has actually had on screen. */
  itemIds: z.array(idSchema).max(LIMITS.seenMaxIds),
  /**
   * Bursts drawn as a collapsed stack, expanded to their visible frames on
   * the server, so a stack standing for forty-five frames latches all of them
   * without the client ever holding forty-five ids.
   */
  burstIds: z.array(idSchema).max(LIMITS.seenMaxIds).default([]),
});

/** What the viewer has had on screen. */
export type ItemsSeenRequest = z.infer<typeof itemsSeenRequestSchema>;

/**
 * The canonical order of the six reactions, and therefore the tiebreak when
 * two kinds have the same count.
 *
 * The server orders by `(count DESC, canonical position ASC)`. The client
 * sorts by count with no tiebreak, so four loves and four cares would swap
 * places between page loads without this.
 */
export const REACTION_ORDER: readonly ReactionKind[] = [
  "like",
  "love",
  "care",
  "haha",
  "wow",
  "sad",
];

/**
 * What this viewer may do on this item.
 *
 * Commenting and reacting are absent because holding this payload is the
 * permission: everybody who can open an item can comment on it and react to
 * it (`PRODUCT.md` § Visibility).
 *
 * The split is by consequence and not by role, which is the thing most easily
 * got wrong in this slice (`conventions.md` § Who may change an item).
 */
export const itemCapabilitiesSchema = z.object({
  /**
   * `items.uploaded_by = me`, or admin. Ownership, not the role, because
   * changing who can see a photograph belongs to whoever put it there
   * (`items.md` Ruling 1). The route checks the role as well, so a demoted
   * uploader still meets a 403.
   */
  canSetVisibility: z.boolean(),
  /**
   * Any uploader or admin: the additive half is better for being collective.
   */
  canEditTags: z.boolean(),
  canEditPeople: z.boolean(),
  canDescribe: z.boolean(),
  /** `items.uploaded_by = me`, or admin. Ownership, not the role. */
  canFixCaptureDate: z.boolean(),
  /** `items.uploaded_by = me`, or admin (the cascade matrix). */
  canDelete: z.boolean(),
  /**
   * The viewer's linked person is in `item_people`, they did not upload it,
   * and they hold no open request. The route that acts on it is not built
   * yet.
   */
  canRequestRemoval: z.boolean(),
  /** `Viewer.isAdmin`. `GET /api/items/:itemId/viewers` is not built yet. */
  canSeeViewers: z.boolean(),
});

/** What this viewer may do on this item. */
export type ItemCapabilities = z.infer<typeof itemCapabilitiesSchema>;

/**
 * A milestone this item is attached to.
 *
 * An item may be attached to one whose span does not contain it, which is
 * allowed and is what the reconciliation flow is for.
 */
export const attachedMilestoneSchema = milestoneRefSchema.extend({
  spanContainsCapturedOn: z.boolean(),
  /**
   * Null re-arms the reconciliation offer; a timestamp means "leave them as
   * they are".
   */
  mismatchAcknowledgedAt: timestampSchema.nullable(),
});

/** A milestone this item is attached to. */
export type AttachedMilestone = z.infer<typeof attachedMilestoneSchema>;

/** One frame in the sibling strip. */
export const burstFrameRefSchema = z.object({
  itemId: idSchema,
  /**
   * 1-based and dense over the **visible** frames only, never
   * `items.burst_index`: a gap in the stored index is a count of what the
   * viewer cannot see.
   */
  position: z.number().int().positive(),
  thumb: mediaSourceSchema,
  /** Composed exactly as `MediaRef.altText` is. */
  altText: z.string(),
});

/** One frame in the sibling strip. */
export type BurstFrameRef = z.infer<typeof burstFrameRefSchema>;

/**
 * How a capture date was arrived at, which is not why it was changed
 * (`items.md` Ruling 2).
 *
 * The order matches the `CHECK` constraint on `items.capture_source` in
 * migration `0003_archive.ts`, so the two can be read side by side. It is an
 * array as well as a schema because the server narrows the stored column
 * against it, and a second hand-written copy of six strings is a second thing
 * to keep in step.
 */
export const CAPTURE_SOURCES = [
  "exif",
  "video_metadata",
  "filename",
  "file_mtime",
  "uploader_set",
  "upload_time",
] as const;

/**
 * The permalink payload.
 *
 * Extends the frozen `ItemSummary` rather than restating it, so the print in
 * the pile and the print on its own page cannot drift.
 */
export const itemDetailSchema = itemSummarySchema.extend({
  captureSource: z.enum(CAPTURE_SOURCES),
  /** The UTC offset the file carried. Null means it carried none. */
  capturedAtOffsetMinutes: z.number().int().nullable(),
  /** Frozen at ingest. What "revert to what the file said" reverts to. */
  originalCapturedAt: timestampSchema,
  /**
   * Null unless somebody typed a real description. Pre-fill the description
   * field from this, never from `media.altText`, or a generated default
   * becomes a typed override on the next save (Decision 9).
   */
  altTextOverride: z.string().nullable(),
  /**
   * 1-based over the visible siblings, against `burst.visibleFrameCount`.
   * Null outside a burst.
   *
   * **Read it against the count, not against `burstFrames`**, which is capped:
   * a frame past the cap has a position here and no entry there, and it is
   * the frame a viewer most often arrives at from the frames route.
   */
  burstPosition: z.number().int().positive().nullable(),
  /**
   * Up to 60 visible siblings. The rest come from the frames route, and
   * `burst.visibleFrameCount` is what says whether there are any.
   */
  burstFrames: z.array(burstFrameRefSchema),
  tags: z.array(tagRefSchema),
  people: z.array(personRefSchema),
  milestones: z.array(attachedMilestoneSchema),
  /** Oldest first. Complete: this slice does not paginate a thread. */
  comments: z.array(commentDtoSchema),
  reactions: reactionSummarySchema,
  capabilities: itemCapabilitiesSchema,
});

/** The permalink payload. */
export type ItemDetail = z.infer<typeof itemDetailSchema>;

/** One page of a fanned burst. */
export const burstFramesRequestSchema = z.object({
  // `z.coerce`, matching `timelineRequestSchema.limit`: a query string is
  // always a string (`?limit=2`), and a bare `z.number()` would reject every
  // caller who actually passed one, honouring only the default.
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(LIMITS.burstFramesMaxFrames)
    .default(LIMITS.burstFramesMaxFrames),
  /**
   * Opaque, and one of the two cursors in the contract that does not encode a
   * bare uuidv7: the sort key is `(burst_index, id)`, because `burst_index` is
   * the order the strip is read in and does not have to agree with arrival
   * order.
   */
  cursor: z.string().optional(),
});

/** One page of a fanned burst. */
export type BurstFramesRequest = z.infer<typeof burstFramesRequestSchema>;

/**
 * One page of a fanned burst.
 *
 * No `BurstSummary` rides along, deliberately: every caller already holds one,
 * from the print it fanned open or from `ItemDetail.burst`.
 */
export const burstFramesResponseSchema = z.object({
  frames: z.array(burstFrameRefSchema),
  nextCursor: z.string().nullable(),
});

/** One page of a fanned burst. */
export type BurstFramesResponse = z.infer<typeof burstFramesResponseSchema>;

/**
 * Every refusal this slice makes, appended to the registry in
 * `conventions.md` § Error code registry.
 *
 * The comment on each is the status it carries, and the pattern behind the
 * statuses is one question rather than two: **404 means you may not see it,
 * 403 means you can see it and may not do it.**
 */
export const ITEM_ERROR_CODES = [
  "item_not_found", // 404, and never 403
  "item_edit_forbidden", // 403, role only
  "item_visibility_forbidden", // 403, role or ownership
  "item_capture_date_forbidden", // 403, ownership or admin
  "item_delete_forbidden", // 403, ownership or admin
  "burst_not_found", // 404
  "comment_not_found", // 404, including when the item is invisible
  "comment_edit_forbidden", // 403, author only
  "comment_delete_forbidden", // 403, author or admin
  "visibility_rule_forbidden", // 403, role only
] as const;

/** Every refusal this slice makes. */
export type ItemsErrorCode = (typeof ITEM_ERROR_CODES)[number];

/** The path parameter every item-scoped route takes. */
export const itemIdParamsSchema = z.object({ itemId: idSchema });

/** The path parameter the burst route takes. */
export const burstIdParamsSchema = z.object({ burstId: idSchema });

/** The path parameter every comment-scoped route takes. */
export const commentIdParamsSchema = z.object({ commentId: idSchema });
