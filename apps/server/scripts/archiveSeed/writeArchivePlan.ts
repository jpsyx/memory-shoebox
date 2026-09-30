// apps/server/scripts/archiveSeed/writeArchivePlan.ts
import type { Kysely } from "kysely";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertBurst,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertItemView,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
  setBurstCover,
} from "../../test/helpers/seedHelpers/archiveSeedHelpers.ts";
import {
  insertItem,
  insertUploadSession,
} from "../../test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  insertGroup,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../test/helpers/seedHelpers/visibilitySeedHelpers.ts";
import {
  ARCHIVE_PLAN,
  RESTRICTED_GROUP_NAME,
  type ArchivePlan,
  type PlannedItem,
} from "./archivePlan.ts";

/** What the seed wrote, for the line the script prints. */
export type WrittenArchive = {
  itemCount: number;
  dayCount: number;
  /** Storage keys the objects have to be uploaded to. */
  storageKeys: string[];
};

/**
 * Every table the seed owns, cleared before it writes, in deletion order.
 *
 * `upload_sessions` is last and has to be: `bursts.upload_session_id`
 * restricts deleting a session a burst still points at, and while
 * `items.upload_session_id` only sets null, an item left pointing at nothing
 * is not what a rerun should leave behind either. Both are gone by the time
 * the session is deleted.
 */
const OWNED_TABLES = [
  "item_views",
  "item_milestones",
  "item_people",
  "item_tags",
  "item_renditions",
  "items",
  "bursts",
  "milestones",
  "people",
  "tags",
  "upload_sessions",
] as const;

/** One rendition a planned item needs: what to call it, and how big it is. */
type PlannedRendition = {
  purpose: string;
  file: string;
  contentType: string;
  width: number;
  height: number;
};

/** The two renditions a photo has: a thumbnail, and its display image. */
function _photoRenditions(item: PlannedItem): PlannedRendition[] {
  const isPortrait = ["bath", "pram", "firstSteps"].includes(item.scene);
  return [
    {
      purpose: "thumb",
      file: `${item.scene}-thumb.jpg`,
      contentType: "image/jpeg",
      width: isPortrait ? 267 : 400,
      height: isPortrait ? 400 : 267,
    },
    {
      purpose: "display",
      file: `${item.scene}.jpg`,
      contentType: "image/jpeg",
      width: isPortrait ? 1067 : 1600,
      height: isPortrait ? 1600 : 1067,
    },
  ];
}

/** The four renditions a video has: a thumb, a poster, and both formats. */
function _videoRenditions(item: PlannedItem): PlannedRendition[] {
  return [
    {
      purpose: "thumb",
      file: `${item.scene}-thumb.jpg`,
      contentType: "image/jpeg",
      width: 400,
      height: 267,
    },
    {
      purpose: "poster",
      file: `${item.scene}-poster.jpg`,
      contentType: "image/jpeg",
      width: 960,
      height: 640,
    },
    {
      purpose: "video_mp4",
      file: `${item.scene}.mp4`,
      contentType: "video/mp4",
      width: 960,
      height: 640,
    },
    {
      purpose: "video_webm",
      file: `${item.scene}.webm`,
      contentType: "video/webm",
      width: 960,
      height: 640,
    },
  ];
}

/** The renditions one planned item needs, and what each is called. */
function _renditionsForItem(item: PlannedItem): PlannedRendition[] {
  return item.kind === "video"
    ? _videoRenditions(item)
    : _photoRenditions(item);
}

/**
 * Everything writing one item threads through: the ids made once, and the
 * maps and lists that grow one entry per item. The maps and the list are
 * mutated in place by the functions below, which is why this type is not
 * wrapped in `Readonly`: each one names the mutation in its own name.
 */
type ItemWriteContext = {
  uploadSessionId: string;
  uploaderMemberId: string;
  viewerMemberId: string;
  restrictedRuleId: string;
  personIdByName: Map<string, string>;
  tagIdByName: Map<string, string>;
  burstIdByKey: Map<string, string>;
  burstFrames: Map<string, string[]>;
  storageKeys: string[];
};

/** Deletes every row in a table this seed owns, so a rerun starts clean. */
async function _clearOwnedTables(database: Kysely<Database>): Promise<void> {
  for (const table of OWNED_TABLES) {
    await database.deleteFrom(table).execute();
  }
}

/**
 * Deletes the restricted group and visibility rule a previous run of this
 * seed made, so writing twice does not collide with the group's unique name.
 *
 * The fixed `everyone` rule migration 0002 seeds is left standing: this seed
 * never owns it, and the whole catalog would lose its default visibility if
 * it went. Deleting a rule cascades to its own subject rows, which is what
 * lets the group beneath it be deleted afterwards without hitting the
 * restrict on `visibility_rule_subjects.group_id`.
 *
 * Must run after `_clearOwnedTables`: `items.visibility_rule_id` restricts
 * deleting a rule an item still points at, so `items` has to be empty first.
 */
async function _clearRestrictedVisibility(
  database: Kysely<Database>,
): Promise<void> {
  await database
    .deleteFrom("visibility_rules")
    .where("id", "!=", EVERYONE_VISIBILITY_RULE_ID)
    .execute();
  await database.deleteFrom("groups").execute();
}

/**
 * Writes the one group restricted items are shared with, and the visibility
 * rule that names it as the only subject who may see a restricted item.
 *
 * @returns The rule's id, which a restricted item's `visibility_rule_id`
 *   points at. The group itself needs no further reference here: the viewer
 *   this seed writes is deliberately never added to it.
 */
async function _writeRestrictedGroup(
  database: Kysely<Database>,
): Promise<{ restrictedRuleId: string }> {
  const groupId = await insertGroup(database, { name: RESTRICTED_GROUP_NAME });
  const restrictedRuleId = await insertVisibilityRule(database, {
    mode: "only",
  });
  await insertVisibilityRuleSubject(database, {
    ruleId: restrictedRuleId,
    groupId,
  });
  return { restrictedRuleId };
}

/** Writes every person and tag the plan names, keyed by display name. */
async function _writeVocabularies(options: {
  database: Kysely<Database>;
  plan: ArchivePlan;
}): Promise<{
  personIdByName: Map<string, string>;
  tagIdByName: Map<string, string>;
}> {
  const { database, plan } = options;
  const personIdByName = new Map<string, string>();
  for (const name of plan.people) {
    personIdByName.set(
      name,
      await insertPerson(database, { displayName: name }),
    );
  }
  const tagIdByName = new Map<string, string>();
  for (const name of plan.tags) {
    tagIdByName.set(name, await insertTag(database, { name }));
  }
  return { personIdByName, tagIdByName };
}

/**
 * Finds the burst row one frame belongs to, creating it on the frame's first
 * appearance. Returns null for a plain print, which carries no burst key.
 */
async function _ensureBurst(options: {
  database: Kysely<Database>;
  item: PlannedItem;
  uploadSessionId: string;
  burstIdByKey: Map<string, string>;
}): Promise<string | null> {
  const { database, item, uploadSessionId, burstIdByKey } = options;
  if (item.burstKey === undefined) {
    return null;
  }
  const existing = burstIdByKey.get(item.burstKey);
  if (existing !== undefined) {
    return existing;
  }
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: item.capturedOn,
  });
  burstIdByKey.set(item.burstKey, burstId);
  return burstId;
}

/** The item's captured-at instant, from its planned day and minute. */
function _capturedAtIso(item: PlannedItem): string {
  const hour = String(Math.floor(item.minuteOfDay / 60)).padStart(2, "0");
  const minute = String(item.minuteOfDay % 60).padStart(2, "0");
  return `${item.capturedOn}T${hour}:${minute}:00.000Z`;
}

/**
 * Writes one item's own row, mutating `context.burstFrames` to record the
 * item as the latest frame of its burst, if it has one.
 *
 * @returns The new item's id.
 */
async function _writeItemRow(options: {
  database: Kysely<Database>;
  item: PlannedItem;
  seq: number;
  context: ItemWriteContext;
}): Promise<string> {
  const { database, item, seq, context } = options;
  const burstId = await _ensureBurst({
    database,
    item,
    uploadSessionId: context.uploadSessionId,
    burstIdByKey: context.burstIdByKey,
  });
  const frames =
    item.burstKey === undefined
      ? undefined
      : (context.burstFrames.get(item.burstKey) ?? []);
  const capturedAt = _capturedAtIso(item);

  const itemId = await insertItem(database, {
    uploadedBy: context.uploaderMemberId,
    kind: item.kind,
    captured_at: capturedAt,
    captured_on: item.capturedOn,
    original_captured_at: capturedAt,
    seq,
    upload_session_id: context.uploadSessionId,
    visibility_rule_id:
      item.visibility === "everyone"
        ? EVERYONE_VISIBILITY_RULE_ID
        : context.restrictedRuleId,
    burst_id: burstId,
    burst_index: frames === undefined ? null : frames.length,
    duration_ms: item.kind === "video" ? 10_000 : null,
    content_type: item.kind === "video" ? "video/mp4" : "image/jpeg",
    original_filename: `${item.key}.jpg`,
    alt_text: null,
  });

  if (frames !== undefined && item.burstKey !== undefined) {
    frames.push(itemId);
    context.burstFrames.set(item.burstKey, frames);
  }
  return itemId;
}

/**
 * Writes one item's renditions, appending each one's storage key to
 * `storageKeys` as it goes.
 */
async function _writeItemRenditions(options: {
  database: Kysely<Database>;
  item: PlannedItem;
  itemId: string;
  storageKeys: string[];
}): Promise<void> {
  const { database, item, itemId, storageKeys } = options;
  for (const rendition of _renditionsForItem(item)) {
    // One key per rendition, never shared: `item_renditions_storage_key` is
    // uniquely indexed, so two items cannot point at one object.
    const storageKey = `seed/${item.key}/${rendition.purpose}/${rendition.file}`;
    storageKeys.push(storageKey);
    await insertRendition(database, {
      itemId,
      purpose: rendition.purpose,
      storage_key: storageKey,
      content_type: rendition.contentType,
      width: rendition.width,
      height: rendition.height,
    });
  }
}

/** Writes one item's tags, its people, and the viewer's visit, if any. */
async function _writeItemLinks(options: {
  database: Kysely<Database>;
  item: PlannedItem;
  itemId: string;
  viewerMemberId: string;
  personIdByName: Map<string, string>;
  tagIdByName: Map<string, string>;
}): Promise<void> {
  const {
    database,
    item,
    itemId,
    viewerMemberId,
    personIdByName,
    tagIdByName,
  } = options;
  for (const tag of item.tags) {
    const tagId = tagIdByName.get(tag);
    if (tagId !== undefined) {
      await insertItemTag(database, { itemId, tagId });
    }
  }
  for (const person of item.people) {
    const personId = personIdByName.get(person);
    if (personId !== undefined) {
      await insertItemPerson(database, { itemId, personId });
    }
  }
  if (item.seenByViewer) {
    await insertItemView(database, { memberId: viewerMemberId, itemId });
  }
}

/** Writes every planned item: its row, its renditions, its tags and people. */
async function _writeItems(options: {
  database: Kysely<Database>;
  plan: ArchivePlan;
  context: ItemWriteContext;
}): Promise<void> {
  const { database, plan, context } = options;
  for (const [index, item] of plan.items.entries()) {
    const itemId = await _writeItemRow({
      database,
      item,
      seq: index + 1,
      context,
    });
    await _writeItemRenditions({
      database,
      item,
      itemId,
      storageKeys: context.storageKeys,
    });
    await _writeItemLinks({
      database,
      item,
      itemId,
      viewerMemberId: context.viewerMemberId,
      personIdByName: context.personIdByName,
      tagIdByName: context.tagIdByName,
    });
  }
}

/** Names each burst's first frame as its cover, now that frames exist. */
async function _writeBurstCovers(options: {
  database: Kysely<Database>;
  burstIdByKey: Map<string, string>;
  burstFrames: Map<string, string[]>;
}): Promise<void> {
  const { database, burstIdByKey, burstFrames } = options;
  for (const [burstKey, frameIds] of burstFrames) {
    const burstId = burstIdByKey.get(burstKey);
    const coverItemId = frameIds[0];
    if (burstId !== undefined && coverItemId !== undefined) {
      await setBurstCover(database, { burstId, coverItemId });
    }
  }
}

/** Writes one occasion and attaches every item captured within its span. */
async function _writeMilestone(options: {
  database: Kysely<Database>;
  milestone: ArchivePlan["milestones"][number];
  uploaderMemberId: string;
}): Promise<void> {
  const { database, milestone, uploaderMemberId } = options;
  const days = [...milestone.days].sort();
  const milestoneId = await insertMilestone(database, {
    name: milestone.name,
    startsOn: days[0] ?? "2026-01-01",
    endsOn: days[days.length - 1] ?? days[0] ?? "2026-01-01",
    blurb: milestone.blurb,
    created_by: uploaderMemberId,
  });
  const onSpan = await database
    .selectFrom("items")
    .select("id")
    .where("captured_on", "in", days)
    .execute();
  for (const row of onSpan) {
    await insertItemMilestone(database, { itemId: row.id, milestoneId });
  }
}

/** Writes every occasion in the plan. */
async function _writeMilestones(options: {
  database: Kysely<Database>;
  plan: ArchivePlan;
  uploaderMemberId: string;
}): Promise<void> {
  const { database, plan, uploaderMemberId } = options;
  for (const milestone of plan.milestones) {
    await _writeMilestone({ database, milestone, uploaderMemberId });
  }
}

/** Assembles the mutable context threaded through writing every item. */
function _makeItemWriteContext(options: {
  uploadSessionId: string;
  uploaderMemberId: string;
  viewerMemberId: string;
  restrictedRuleId: string;
  personIdByName: Map<string, string>;
  tagIdByName: Map<string, string>;
}): ItemWriteContext {
  return {
    ...options,
    burstIdByKey: new Map(),
    burstFrames: new Map(),
    storageKeys: [],
  };
}

/**
 * Writes one archive into a catalog, replacing whatever the seed wrote before.
 *
 * Idempotent by deletion rather than by upsert: the seed owns every row in
 * `OWNED_TABLES`, plus the restricted group and its visibility rule (see
 * `_clearRestrictedVisibility`), and clearing them is both simpler and honest
 * about that. It refuses nothing: a development catalog is assumed to hold
 * only what this seed wrote.
 *
 * @returns What was written, including the storage keys the objects belong at.
 */
export async function writeArchivePlan(options: {
  database: Kysely<Database>;
  plan?: ArchivePlan;
  uploaderMemberId: string;
  viewerMemberId: string;
}): Promise<WrittenArchive> {
  const { database, uploaderMemberId, viewerMemberId } = options;
  const plan = options.plan ?? ARCHIVE_PLAN;

  await _clearOwnedTables(database);
  await _clearRestrictedVisibility(database);

  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: uploaderMemberId,
  });
  const { restrictedRuleId } = await _writeRestrictedGroup(database);
  const { personIdByName, tagIdByName } = await _writeVocabularies({
    database,
    plan,
  });

  const context = _makeItemWriteContext({
    uploadSessionId,
    uploaderMemberId,
    viewerMemberId,
    restrictedRuleId,
    personIdByName,
    tagIdByName,
  });

  await _writeItems({ database, plan, context });
  await _writeBurstCovers({
    database,
    burstIdByKey: context.burstIdByKey,
    burstFrames: context.burstFrames,
  });
  await _writeMilestones({ database, plan, uploaderMemberId });

  return {
    itemCount: plan.items.length,
    dayCount: plan.days.length,
    storageKeys: context.storageKeys,
  };
}

/** A readable id for a seeded row, so a catalog inspected by hand says so. */
export function makeSeedId(): string {
  return createId();
}
