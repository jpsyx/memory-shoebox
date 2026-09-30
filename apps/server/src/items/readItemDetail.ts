import { sql } from "kysely";
import {
  type AttachedMilestone,
  type BurstFrameRef,
  type BurstSummary,
  type CommentDto,
  type ItemDetail,
  type MediaRef,
  type MediaSource,
  type MemberRef,
  type PersonRef,
  type ReactionSummary,
  type TagRef,
  type VisibilitySummary,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { makeAltTextFromItem } from "../archive/makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "../archive/makeMediaRefFromSources.ts";
import { readBurstCovers } from "../archive/readBurstCovers.ts";
import { readMediaSources } from "../archive/readMediaSources.ts";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import { readPeopleRefsByItemId } from "../archive/readPeopleRefsByItemId.ts";
import { readVisibilitySummaries } from "../archive/readVisibilitySummaries.ts";
import type { B2Client } from "../b2/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";
import { makeItemCapabilitiesFromItem } from "./itemPermissions.ts";
import { makeBurstSummaryFromRows } from "./makeBurstSummaryFromRows.ts";
import {
  makeBurstFrameRefsFromRows,
  readBurstFrameRows,
  readBurstFrameTotals,
  type BurstFrameRow,
  type BurstFrameTotals,
} from "./readBurstFrameRefs.ts";
import { readCommentThread } from "./readCommentThread.ts";
import {
  EMPTY_REACTION_SUMMARY,
  makeReactionSummariesFromRows,
  readItemReactionRows,
} from "./readReactionSummaries.ts";

/** What the composer needs, and what every mutation hands it back. */
export type ItemDetailOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  item: VisibleItem;
  /** The request's clock, which `expiresAt` counts from. */
  now: Date;
};

/** Everything the payload is built from, read in one round of the catalog. */
type ItemDetailParts = {
  mediaSources: ReadonlyMap<string, ReadonlyMap<string, MediaSource>>;
  peopleByItemId: ReadonlyMap<string, PersonRef[]>;
  visibilities: ReadonlyMap<string, VisibilitySummary>;
  members: ReadonlyMap<string, MemberRef>;
  timezone: string;
  tags: TagRef[];
  milestones: AttachedMilestone[];
  comments: CommentDto[];
  reactions: ReactionSummary;
  isUnseen: boolean;
  removalGate: { isPeopleTagged: boolean; hasOpenRemovalRequest: boolean };
  burstCovers: ReadonlyMap<string, string>;
};

/** The column is a closed `CHECK`, so this cannot see a seventh source. */
function _getCaptureSourceFromStoredValue(
  value: string,
): ItemDetail["captureSource"] {
  const sources: ReadonlyArray<ItemDetail["captureSource"]> = [
    "exif",
    "video_metadata",
    "filename",
    "file_mtime",
    "uploader_set",
    "upload_time",
  ];
  return (
    sources.find((source) => {
      return source === value;
    }) ?? "upload_time"
  );
}

/** The item's tags, in the order they were put on it. */
async function _readTags(options: {
  database: DatabaseExecutor;
  itemId: string;
}): Promise<TagRef[]> {
  return options.database
    .selectFrom("item_tags")
    .innerJoin("tags", "tags.id", "item_tags.tag_id")
    .select(["tags.id as tagId", "tags.name as name"])
    .where("item_tags.item_id", "=", options.itemId)
    .orderBy("item_tags.tagged_at", "asc")
    .orderBy("tags.name", "asc")
    .execute();
}

/** The occasions this item is attached to, and whether each still holds it. */
async function _readAttachedMilestones(options: {
  database: DatabaseExecutor;
  itemId: string;
  capturedOn: string;
}): Promise<AttachedMilestone[]> {
  const rows = await options.database
    .selectFrom("item_milestones")
    .innerJoin("milestones", "milestones.id", "item_milestones.milestone_id")
    .select([
      "milestones.id as milestoneId",
      "milestones.name as name",
      "milestones.starts_on as startsOn",
      "milestones.ends_on as endsOn",
      "milestones.blurb as blurb",
      "item_milestones.span_mismatch_acknowledged_at as mismatchAcknowledgedAt",
    ])
    .where("item_milestones.item_id", "=", options.itemId)
    .orderBy("milestones.starts_on", "asc")
    .execute();

  return rows.map((row) => {
    return {
      ...row,
      // `ends_on` is inclusive and never null, and both are `YYYY-MM-DD`, so
      // a string comparison is the date comparison.
      spanContainsCapturedOn:
        row.startsOn <= options.capturedOn && options.capturedOn <= row.endsOn,
    };
  });
}

/**
 * The two facts `canRequestRemoval` needs, in one statement.
 *
 * The tag gate is `removals.md`'s, joined through `people.member_id` because
 * the link to an account sits on `people`. **It only ever subtracts**: it is
 * evaluated on a row that has already passed the visibility predicate, and it
 * appears in no `SELECT` that lists items anywhere in the product.
 */
async function _readRemovalGate(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemId: string;
}): Promise<{ isPeopleTagged: boolean; hasOpenRemovalRequest: boolean }> {
  const row = await options.database
    .selectNoFrom((eb) => {
      return [
        eb
          .exists(
            eb
              .selectFrom("item_people")
              .innerJoin("people", "people.id", "item_people.person_id")
              .select(sql<number>`1`.as("one"))
              .where("item_people.item_id", "=", options.itemId)
              .where("people.member_id", "=", options.viewer.memberId),
          )
          .as("isPeopleTagged"),
        eb
          .exists(
            eb
              .selectFrom("removal_requests")
              .select(sql<number>`1`.as("one"))
              .where("removal_requests.item_id", "=", options.itemId)
              .where(
                "removal_requests.requested_by_member_id",
                "=",
                options.viewer.memberId,
              )
              .where("removal_requests.state", "=", "open"),
          )
          .as("hasOpenRemovalRequest"),
      ];
    })
    .executeTakeFirstOrThrow();

  return {
    isPeopleTagged: Boolean(row.isPeopleTagged),
    hasOpenRemovalRequest: Boolean(row.hasOpenRemovalRequest),
  };
}

/** Whether the viewer has never had this item on screen. */
async function _readIsUnseen(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemId: string;
}): Promise<boolean> {
  const row = await options.database
    .selectFrom("item_views")
    .select("item_views.item_id as itemId")
    .where("item_views.item_id", "=", options.itemId)
    .where("item_views.member_id", "=", options.viewer.memberId)
    .executeTakeFirst();

  return row === undefined;
}

/** The two reads a burst costs, and what the payload takes from each. */
type BurstParts = {
  /** The strip's rows, capped at `appConfig.items.burstStripMaxFrames`. */
  rows: BurstFrameRow[];
  /** The whole visible sibling set, measured uncapped beside the rows. */
  totals: BurstFrameTotals;
  /** This item's 1-based place among those visible siblings. */
  framePosition: number;
};

/**
 * The strip, and the aggregate that says how much of the burst it is showing.
 *
 * Two queries, run together. The rows are capped because a strip of a thousand
 * thumbnails is not a strip; the aggregate is not, because
 * `burst.visibleFrameCount` and `ItemDetail.burstPosition` are read against
 * the whole visible burst and are what send a viewer to
 * `GET /api/bursts/:burstId/frames` for the rest.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.item The item, for its own place in the order.
 * @param options.burstId The burst it sits in.
 */
async function _readBurstParts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  burstId: string;
}): Promise<BurstParts> {
  const [rows, aggregate] = await Promise.all([
    readBurstFrameRows({
      database: options.database,
      viewer: options.viewer,
      burstId: options.burstId,
      limit: appConfig.items.burstStripMaxFrames,
    }),
    readBurstFrameTotals({
      database: options.database,
      viewer: options.viewer,
      burstId: options.burstId,
      frame: {
        itemId: options.item.itemId,
        burstIndex: options.item.burstIndex,
      },
    }),
  ]);

  return {
    rows,
    totals: aggregate.totals,
    framePosition: aggregate.framePosition,
  };
}

/**
 * Every read the payload needs, keyed by the ids it will actually draw.
 *
 * The item's own id is always in `itemIds`, including when the strip does not
 * hold it: a burst past the 60-frame cap can leave the item out of its own
 * siblings, and a permalink with no renditions to sign is a 500 rather than a
 * blank page.
 *
 * @param options.detailOptions What the composer was called with.
 * @param options.burstRows The visible siblings, already read.
 */
async function _readItemDetailParts(options: {
  detailOptions: Readonly<ItemDetailOptions>;
  burstRows: readonly BurstFrameRow[];
}): Promise<ItemDetailParts> {
  const { database, b2, viewer, item, now } = options.detailOptions;
  const stripItemIds = options.burstRows.map((row) => {
    return row.itemId;
  });
  const itemIds = stripItemIds.includes(item.itemId)
    ? stripItemIds
    : [item.itemId, ...stripItemIds];

  const [
    mediaSources,
    peopleByItemId,
    visibilities,
    members,
    settings,
    tags,
    milestones,
    reactionRows,
    isUnseen,
    removalGate,
    burstCovers,
  ] = await Promise.all([
    readMediaSources({
      database,
      b2,
      itemIds,
      now,
      ttlSeconds: appConfig.media.signedUrlTtlSeconds,
    }),
    readPeopleRefsByItemId({ database, itemIds }),
    readVisibilitySummaries({ database, ruleIds: [item.visibilityRuleId] }),
    readMemberRefs(database),
    readInstanceSettings({ database, keys: ["shoebox.timezone"] }),
    _readTags({ database, itemId: item.itemId }),
    _readAttachedMilestones({
      database,
      itemId: item.itemId,
      capturedOn: item.capturedOn,
    }),
    readItemReactionRows({ database, itemId: item.itemId }),
    _readIsUnseen({ database, viewer, itemId: item.itemId }),
    _readRemovalGate({ database, viewer, itemId: item.itemId }),
    item.burstId === null
      ? new Map<string, string>()
      : readBurstCovers({ database, burstIds: [item.burstId] }),
  ]);

  return {
    mediaSources,
    peopleByItemId,
    visibilities,
    members,
    timezone: settings["shoebox.timezone"],
    tags,
    milestones,
    comments: await readCommentThread({
      database,
      itemId: item.itemId,
      viewer,
      members,
    }),
    reactions:
      makeReactionSummariesFromRows({
        rows: reactionRows,
        members,
        viewerMemberId: viewer.memberId,
      }).get(item.itemId) ?? EMPTY_REACTION_SUMMARY,
    isUnseen,
    removalGate,
    burstCovers,
  };
}

/** This item's print, or the end of the ingest defect that lost it. */
function _makeMediaRefForItem(options: {
  item: VisibleItem;
  people: readonly PersonRef[];
  parts: ItemDetailParts;
}): MediaRef {
  const { item } = options;
  const media = makeMediaRefFromSources({
    sources: options.parts.mediaSources.get(item.itemId) ?? new Map(),
    durationMs: item.durationMs,
    altText: makeAltTextFromItem({
      altTextOverride: item.altTextOverride,
      personNames: options.people.map((person) => {
        return person.displayName;
      }),
      capturedAt: item.capturedAt,
      timezone: options.parts.timezone,
    }),
  });

  if (media === undefined) {
    // The pile counts an item with no renditions and does not draw it. A
    // permalink has nothing to fall back to, so this is the ingest defect
    // reaching its end.
    throw new Error(`Item ${item.itemId} has no renditions to draw.`);
  }
  return media;
}

/** The payload, once every read and every derived value is in hand. */
function _makeItemDetailFromParts(options: {
  detailOptions: Readonly<ItemDetailOptions>;
  parts: ItemDetailParts;
  media: MediaRef;
  burst: BurstSummary | null;
  burstFrames: readonly BurstFrameRef[];
  burstPosition: number | null;
}): ItemDetail {
  const { item, viewer } = options.detailOptions;
  const { parts } = options;

  return {
    itemId: item.itemId,
    kind: item.kind,
    capturedAt: item.capturedAt,
    capturedOn: item.capturedOn,
    media: options.media,
    isUnseen: parts.isUnseen,
    uploadedBy: parts.members.get(item.uploadedBy) ?? {
      memberId: item.uploadedBy,
      displayName: "",
    },
    visibility: parts.visibilities.get(item.visibilityRuleId) ?? {
      visibilityRuleId: item.visibilityRuleId,
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst: options.burst,
    captureSource: _getCaptureSourceFromStoredValue(item.captureSource),
    capturedAtOffsetMinutes: item.capturedAtOffsetMinutes,
    originalCapturedAt: item.originalCapturedAt,
    altTextOverride: item.altTextOverride,
    // **`burstPosition` is this item's place among the visible siblings**, the
    // set `burst.visibleFrameCount` counts, because the contract reads the one
    // against the other. It is deliberately not a position in `burstFrames`:
    // that list is capped at `appConfig.items.burstStripMaxFrames`, so a frame
    // numbered over it is null past the cap, which is exactly the frame a
    // viewer arrives at through `GET /api/bursts/:burstId/frames`. The cost is
    // that a sibling whose renditions an ingest defect lost shifts the strip's
    // dense numbering out from under it; the count already carries that same
    // gap, so the caption and its denominator still agree with each other.
    burstPosition: options.burstPosition,
    burstFrames: [...options.burstFrames],
    tags: parts.tags,
    people: parts.peopleByItemId.get(item.itemId) ?? [],
    milestones: parts.milestones,
    comments: parts.comments,
    reactions: parts.reactions,
    capabilities: makeItemCapabilitiesFromItem({
      viewer,
      uploadedBy: item.uploadedBy,
      ...parts.removalGate,
    }),
  };
}

/**
 * The burst this item sits in and the strip beside it, decided together.
 *
 * A burst of one visible frame is not a burst: it draws as a plain print, and
 * so it carries no strip either. Deciding the two in one place is what keeps
 * a summary and a strip from contradicting each other.
 *
 * @param options.detailOptions What the composer was called with.
 * @param options.burstParts The strip's rows and the aggregate beside them.
 * @param options.parts Every read the payload is built from.
 * @param options.storedCoverItemId `bursts.cover_item_id`, visible or not.
 */
function _makeBurstAndFramesFromParts(options: {
  detailOptions: Readonly<ItemDetailOptions>;
  burstParts: BurstParts | undefined;
  parts: ItemDetailParts;
  storedCoverItemId: string | undefined;
}): { burst: BurstSummary | null; burstFrames: BurstFrameRef[] } {
  const { item } = options.detailOptions;
  const burstParts = options.burstParts;
  const burst =
    item.burstId === null || burstParts === undefined
      ? null
      : makeBurstSummaryFromRows({
          burstId: item.burstId,
          rows: burstParts.rows,
          totals: burstParts.totals,
          storedCoverItemId: options.storedCoverItemId,
        });

  return {
    burst,
    // The strip is composed from the maps `_readItemDetailParts` already read
    // over the item **and** its siblings, never from three reads of its own:
    // `items.md` § Performance queries 3 and 6 are each one batched read
    // covering both, and re-signing the strip here made them two.
    burstFrames:
      burst === null || burstParts === undefined
        ? []
        : makeBurstFrameRefsFromRows({
            rows: burstParts.rows,
            sources: {
              mediaSources: options.parts.mediaSources,
              peopleByItemId: options.parts.peopleByItemId,
              timezone: options.parts.timezone,
            },
          }),
  };
}

/**
 * The permalink payload, in one response.
 *
 * **This is the shape every route in the slice returns**, the read route and
 * every mutation alike, so that saving a description and re-opening the
 * photograph cannot produce two different pictures of the same item.
 *
 * Twelve reads for an item outside a burst and fifteen for one inside it,
 * none of them in a loop, and four N+1 risks avoided by name: the thread's
 * reactions are one `comment_id IN (...)`; the strip's people are one
 * `item_id IN (...)`, because every frame's alt text composes from its own
 * people; the renditions for the item and the strip are one batched fetch;
 * and the members table is read once and every author and reactor resolved
 * from it. Nothing here is per comment or per frame, which is the property
 * the query-count test pins.
 *
 * A burst costs exactly three reads more than a plain item: the strip's
 * capped rows, the aggregate beside them, and the stored cover. The strip is
 * composed from the same `mediaSources`, `peopleByItemId` and timezone this
 * already holds. It cost six more until the query-count test said so:
 * `makeBurstFrameRefsFromRows` re-read all three for the strip alone, which
 * made queries 3 and 6 two batched reads each where the contract says one.
 * The aggregate is the one that cannot be folded away: every figure it
 * answers is measured over the whole visible burst, and the rows beside it
 * are capped.
 *
 * It does **not** count the open. Only `GET /api/items/:itemId` does that, and
 * it does it after this returns: saving a description is not opening a
 * photograph.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.b2 The Backblaze client.
 * @param options.viewer The request's viewer.
 * @param options.item The row `getVisibleItemOr404` already resolved.
 * @param options.now The request's clock.
 */
export async function readItemDetail(
  options: Readonly<ItemDetailOptions>,
): Promise<ItemDetail> {
  const { item, viewer } = options;

  if (item.kind === "video" && item.durationMs === null) {
    // The transport positions every pinned mark as `at_seconds / duration`,
    // so without it every mark lands wrong on first paint and then jumps.
    // That is an ingest defect, and a 500 is more honest than a payload whose
    // marks are guaranteed wrong.
    throw new Error(`Video ${item.itemId} has no stored duration.`);
  }

  const burstParts =
    item.burstId === null
      ? undefined
      : await _readBurstParts({
          database: options.database,
          viewer,
          item,
          burstId: item.burstId,
        });

  const parts = await _readItemDetailParts({
    detailOptions: options,
    burstRows: burstParts?.rows ?? [],
  });

  const { burst, burstFrames } = _makeBurstAndFramesFromParts({
    detailOptions: options,
    burstParts,
    parts,
    storedCoverItemId:
      item.burstId === null ? undefined : parts.burstCovers.get(item.burstId),
  });

  return _makeItemDetailFromParts({
    detailOptions: options,
    parts,
    media: _makeMediaRefForItem({
      item,
      people: parts.peopleByItemId.get(item.itemId) ?? [],
      parts,
    }),
    burst,
    burstFrames,
    // Null whenever there is no burst to be a position in, which includes the
    // single visible frame that draws as a plain print.
    burstPosition: burst === null ? null : (burstParts?.framePosition ?? null),
  });
}
