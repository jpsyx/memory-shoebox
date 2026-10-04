import {
  readRemovalGate,
  type RemovalGate,
} from "../../removals/readRemovalGate/readRemovalGate.ts";
import {
  type AttachedMilestone,
  type CommentDto,
  type MediaSource,
  type MemberRef,
  type PersonRef,
  type ReactionSummary,
  type TagRef,
  type VisibilitySummary,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../../app.config.ts";
import { readBurstCovers } from "../../archive/readBurstCovers.ts";
import { readMediaSources } from "../../archive/readMediaSources.ts";
import { readMemberRefs } from "../../archive/readMemberRefs.ts";
import { readPeopleRefsByItemId } from "../../archive/readPeopleRefsByItemId.ts";
import { readVisibilitySummaries } from "../../archive/readVisibilitySummaries.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import type { VisibleItem } from "../getVisibleItemOr404.ts";
import { readCommentThread } from "../readCommentThread.ts";
import {
  makeEmptyReactionSummary,
  makeReactionSummariesFromRows,
  readItemReactionRows,
  type ReactionRow,
} from "../readReactionSummaries.ts";
import type { BurstFrameRow } from "../readBurstFrameRefs/readBurstFrameRows.ts";
import type { ItemDetailOptions } from "./readItemDetail.types.ts";

/** Everything the payload is built from, read in one round of the catalog. */
export type ItemDetailParts = {
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
  removalGate: RemovalGate;
  burstCovers: ReadonlyMap<string, string>;
};

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

/**
 * The ids the batched reads below key off.
 *
 * The item's own id is always in the list, including when the strip does not
 * hold it: a burst past the 60-frame cap can leave the item out of its own
 * siblings, and a permalink with no renditions to sign is a 500 rather than a
 * blank page.
 *
 * @param options.item The item the permalink is for.
 * @param options.burstRows The visible siblings, already read.
 */
function _getItemIdsForDetail(options: {
  item: VisibleItem;
  burstRows: readonly BurstFrameRow[];
}): string[] {
  const stripItemIds = options.burstRows.map((row) => {
    return row.itemId;
  });
  return stripItemIds.includes(options.item.itemId)
    ? stripItemIds
    : [options.item.itemId, ...stripItemIds];
}

/** The eleven reads the payload costs, run together and named on the way out. */
type ItemDetailLookups = {
  mediaSources: ReadonlyMap<string, ReadonlyMap<string, MediaSource>>;
  peopleByItemId: ReadonlyMap<string, PersonRef[]>;
  visibilities: ReadonlyMap<string, VisibilitySummary>;
  members: ReadonlyMap<string, MemberRef>;
  timezone: string;
  tags: TagRef[];
  milestones: AttachedMilestone[];
  reactionRows: ReactionRow[];
  isUnseen: boolean;
  removalGate: RemovalGate;
  burstCovers: ReadonlyMap<string, string>;
};

/**
 * Every batched read, in one round, for the ids the payload will draw.
 *
 * None of the eleven depends on another, so they are one `Promise.all` rather
 * than a sequence. The strip's renditions and people ride along with the
 * item's own, which is what keeps `items.md` § Performance queries 3 and 6 at
 * one batched read each.
 *
 * @param options.detailOptions What the composer was called with.
 * @param options.itemIds The item and its strip, from `_getItemIdsForDetail`.
 */
async function _readItemDetailLookups(options: {
  detailOptions: Readonly<ItemDetailOptions>;
  itemIds: readonly string[];
}): Promise<ItemDetailLookups> {
  const { database, b2, viewer, item, now } = options.detailOptions;

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
      itemIds: options.itemIds,
      now,
      ttlSeconds: appConfig.media.signedUrlTtlSeconds,
    }),
    readPeopleRefsByItemId({ database, itemIds: options.itemIds }),
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
    readRemovalGate({ database, viewer, itemId: item.itemId }),
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
    reactionRows,
    isUnseen,
    removalGate,
    burstCovers,
  };
}

/**
 * Every read the payload needs, keyed by the ids it will actually draw.
 *
 * The thread and the reaction summary are composed here rather than by the
 * payload, because both are read against the members table this already holds:
 * looking either up again is the N+1 the query-count test pins.
 *
 * @param options.detailOptions What the composer was called with.
 * @param options.burstRows The visible siblings, already read.
 */
export async function readItemDetailParts(options: {
  detailOptions: Readonly<ItemDetailOptions>;
  burstRows: readonly BurstFrameRow[];
}): Promise<ItemDetailParts> {
  const { database, viewer, item } = options.detailOptions;

  // `reactionRows` is taken off the rest: the payload carries the summary
  // they roll up to, never the rows themselves.
  const { reactionRows, ...lookups } = await _readItemDetailLookups({
    detailOptions: options.detailOptions,
    itemIds: _getItemIdsForDetail({ item, burstRows: options.burstRows }),
  });

  return {
    ...lookups,
    comments: await readCommentThread({
      database,
      itemId: item.itemId,
      viewer,
      members: lookups.members,
    }),
    reactions:
      makeReactionSummariesFromRows({
        rows: reactionRows,
        members: lookups.members,
        viewerMemberId: viewer.memberId,
      }).get(item.itemId) ?? makeEmptyReactionSummary(),
  };
}
