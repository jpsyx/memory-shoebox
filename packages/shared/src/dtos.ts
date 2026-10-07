import { z } from "zod";

/**
 * The frozen DTOs: the shapes more than one route slice needs.
 *
 * From `tech-specs/apis/conventions.md` § The frozen DTOs, which is the
 * specification for every field list below. They are frozen because eight API
 * slice documents were written in parallel against them. Five of those slices
 * needed an item shape; without a single definition there would now be five
 * item shapes and no contract.
 *
 * Use them by name. Do not redefine one, widen one inline, or invent a
 * near-duplicate: a slice that needs a field one of them lacks requests the
 * addition here rather than forking the shape in its own route bodies.
 *
 * They are mutually referential (`ItemSummary` composes `MediaRef`,
 * `VisibilitySummary` and `BurstSummary`), which is why they share one file.
 *
 * The four primitives the shapes are built from are exported alongside them.
 * Every route slice needs an id, a timestamp, a calendar date or a signed URL,
 * and eight slices each deriving their own is the same fork the frozen DTOs
 * exist to prevent: a slice that writes its own `z.iso.datetime()` has already
 * chosen a precision and an offset rule nobody agreed to.
 */

/**
 * A uuid id. Every id in the contract is a UUIDv7 primary key
 * (`data-models.md` § Conventions), so a slug or a database rowid is not one.
 */
export const idSchema = z.uuid();

/**
 * An ISO-8601 UTC timestamp with milliseconds, the only form a `*At` field may
 * take (`conventions.md` § Field naming).
 *
 * `offset: false` requires the trailing `Z`, and `precision: 3` requires
 * exactly three fractional digits. Together they reject a local-offset
 * timestamp and, more importantly, every formatted or relative string:
 * "27 September 2026" and "2 hours ago" do not parse. Formatting happens in
 * the browser, because that is where the reader's locale is.
 */
export const timestampSchema = z.iso.datetime({ offset: false, precision: 3 });

/**
 * A `YYYY-MM-DD` calendar date, the only form a `*On` field may take
 * (`conventions.md` § Field naming). It rejects a formatted date and also a
 * full timestamp, which is a different thing wearing the same suffix.
 */
export const calendarDateSchema = z.iso.date();

/**
 * A signed, short-lived URL for one stored object.
 *
 * `conventions.md` § Forbidden in any payload bans a raw storage key outright,
 * so this must be an absolute URL and never a path: `items/4620/thumb.jpg` has
 * no protocol and no host and therefore cannot parse. Constraining the
 * protocol to `http` or `https` additionally rejects `javascript:` and `data:`
 * URLs, which are absolute but are not something the media layer ever mints.
 * `http` stays permitted because a self-hoster's first run is over plain HTTP
 * on their own machine.
 */
export const signedUrlSchema = z.url({ protocol: /^https?$/ });

/** The six reactions. Closed: there is no "angry" and no custom kind. */
export const reactionKindSchema = z.enum([
  "like",
  "love",
  "care",
  "haha",
  "wow",
  "sad",
]);

/** The six reactions. Closed: there is no "angry" and no custom kind. */
export type ReactionKind = z.infer<typeof reactionKindSchema>;

/** A signed, short-lived URL for one stored object. Never a storage key. */
export const mediaSourceSchema = z.object({
  /** Absolute and signed, minted at render. Never a storage key. */
  url: signedUrlSchema,
  /** When the signature stops working, so the client can re-request in time. */
  expiresAt: timestampSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/** A signed, short-lived URL for one stored object. Never a storage key. */
export type MediaSource = z.infer<typeof mediaSourceSchema>;

/** Everything needed to draw one print without a second request. */
export const mediaRefSchema = z.object({
  thumb: mediaSourceSchema,
  display: mediaSourceSchema,
  /** Videos only. */
  poster: mediaSourceSchema.nullable(),
  video: z
    .object({
      webm: mediaSourceSchema.nullable(),
      mp4: mediaSourceSchema.nullable(),
    })
    .nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  /** Always present: the generated string, or the override when one exists. */
  altText: z.string(),
});

/** Everything needed to draw one print without a second request. */
export type MediaRef = z.infer<typeof mediaRefSchema>;

/** An account. No email unless the route is admin-scoped. */
export const memberRefSchema = z.object({
  memberId: idSchema,
  displayName: z.string(),
});

/** An account. No email unless the route is admin-scoped. */
export type MemberRef = z.infer<typeof memberRefSchema>;

/**
 * Someone tagged in a photograph. Never carries `memberId`: a tagged person is
 * not an account, and the people directory is not the member list
 * (`data-models.md` § `people`, `item_people`).
 */
export const personRefSchema = z.object({
  personId: idSchema,
  displayName: z.string(),
});

/** Someone tagged in a photograph. A tagged person is not an account. */
export type PersonRef = z.infer<typeof personRefSchema>;

/** One tag, as it appears on an item or in a picker. */
export const tagRefSchema = z.object({
  tagId: idSchema,
  name: z.string(),
});

/** One tag, as it appears on an item or in a picker. */
export type TagRef = z.infer<typeof tagRefSchema>;

/** One milestone, as it appears on an item or in a list. */
export const milestoneRefSchema = z.object({
  milestoneId: idSchema,
  name: z.string(),
  startsOn: calendarDateSchema,
  endsOn: calendarDateSchema,
  blurb: z.string().nullable(),
});

/** One milestone, as it appears on an item or in a list. */
export type MilestoneRef = z.infer<typeof milestoneRefSchema>;

/**
 * A visibility rule's id.
 *
 * **Deliberately not `idSchema`.** Every other id in the contract is a uuidv7
 * primary key, and this one usually is too, but the seeded `everyone` rule is
 * the readable `visibility-rule-everyone` so that an `items` row inspected in
 * the `sqlite3` shell says what it means
 * (`apps/server/src/visibility/everyoneRule.ts`). Validating it as a uuid
 * would reject the one rule every fresh Shoebox uses for everything.
 */
export const visibilityRuleIdSchema = z.string().min(1).max(64);

/** Who can see one item, in the form the interface draws it. */
export const visibilitySummarySchema = z.object({
  /**
   * Which rule this is, so the edit control can pre-fill from it and detect a
   * no-op save (`items.md` § Additions requested 2). An opaque id revealing
   * strictly less than the `subjects` list beside it, and only ever served on
   * an item the viewer can see.
   */
  visibilityRuleId: visibilityRuleIdSchema,
  mode: z.enum(["everyone", "only", "except"]),
  /**
   * "Just us two". Composed from the rule's subjects at read time, never
   * stored.
   */
  label: z.string().nullable(),
  subjects: z.array(
    z.object({
      kind: z.enum(["member", "group"]),
      /**
       * Spelled `id`, where § Field naming says `<thing>Id`. The one
       * inconsistency the frozen DTOs kept rather than fixed: it reads fine
       * nested inside a field that names the thing, and changing a shape eight
       * slices cite is worse than the inconsistency. Not licence for the next
       * nested id (`conventions.md` § The frozen DTOs).
       */
      id: idSchema,
      displayName: z.string(),
    }),
  ),
});

/** Who can see one item, in the form the interface draws it. */
export type VisibilitySummary = z.infer<typeof visibilitySummarySchema>;

/** A run of frames shot together, collapsed to one entry in the timeline. */
export const burstSummarySchema = z.object({
  burstId: idSchema,
  /** Per viewer. There is no stored frame_count, deliberately. */
  visibleFrameCount: z.number().int().nonnegative(),
  /**
   * Per viewer: `MIN(captured_at)` over the **visible** frames, never
   * `bursts.starts_at`. The stored column is the unfiltered span and would
   * leak the restricted frames through the endpoints of "06:41 to 06:44" in
   * exactly the way a stored count would leak them through a denominator.
   */
  startsAt: timestampSchema,
  /** Per viewer: `MAX(captured_at)` over the visible frames. */
  endsAt: timestampSchema,
  /**
   * Resolved at read time: the cover if visible, else the earliest visible
   * frame.
   */
  coverItemId: idSchema,
  /**
   * Whether any visible frame of this burst has no `item_views` row for this
   * viewer.
   *
   * The stack draws one cover for frames the client has no `isUnseen` for, so
   * without this it cannot tell whether `POST /api/items/seen` would do
   * anything: it would send on every page view, costing a write-lock
   * acquisition each time, or never send, leaving the unfanned frames
   * permanently new. It also lets the stack carry its own accent dot.
   */
  hasUnseenFrames: z.boolean(),
});

/** A run of frames shot together, collapsed to one entry in the timeline. */
export type BurstSummary = z.infer<typeof burstSummarySchema>;

/** One photograph or video as every grid, day and list draws it. */
export const itemSummarySchema = z.object({
  itemId: idSchema,
  kind: z.enum(["photo", "video"]),
  capturedAt: timestampSchema,
  capturedOn: calendarDateSchema,
  media: mediaRefSchema,
  isUnseen: z.boolean(),
  uploadedBy: memberRefSchema,
  visibility: visibilitySummarySchema,
  burst: burstSummarySchema.nullable(),
});

/** One photograph or video as every grid, day and list draws it. */
export type ItemSummary = z.infer<typeof itemSummarySchema>;

/** Every reaction on one thing, plus the viewer's own. */
export const reactionSummarySchema = z.object({
  /** Server-ordered by (count DESC, canonical position ASC). */
  kinds: z.array(
    z.object({
      kind: reactionKindSchema,
      count: z.number().int().nonnegative(),
      members: z.array(memberRefSchema),
    }),
  ),
  myKind: reactionKindSchema.nullable(),
});

/** Every reaction on one thing, plus the viewer's own. */
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;

/** One comment, on an item or at a point in a video. */
export const commentDtoSchema = z.object({
  commentId: idSchema,
  /** Null for a top-level comment; replies have one top-level parent. */
  parentCommentId: idSchema.nullable().default(null),
  author: memberRefSchema,
  body: z.string(),
  /** Where in a video the comment is pinned. Null on a photograph. */
  atSeconds: z.number().nonnegative().nullable(),
  createdAt: timestampSchema,
  /** Drives the "edited" marker. Not optional: see Decision 8. */
  editedAt: timestampSchema.nullable(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  reactions: reactionSummarySchema,
});

/** One comment, on an item or at a point in a video. */
export type CommentDto = z.infer<typeof commentDtoSchema>;
