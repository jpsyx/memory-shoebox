// apps/server/scripts/archiveSeed/writeArchivePlan/writeItems.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../../src/visibility/everyoneRule.ts";
import {
  insertItemPerson,
  insertItemTag,
  insertItemView,
  insertRendition,
} from "../../../test/helpers/seedHelpers/archiveSeedHelpers.ts";
import { insertItem } from "../../../test/helpers/seedHelpers/itemSeedHelpers.ts";
import type { ArchivePlan, PlannedItem } from "../archivePlan.ts";
import { ensureBurst } from "./ensureBurst.ts";
import { makeRenditionsFromItem } from "./makeRenditionsFromItem.ts";

/**
 * Everything writing one item threads through: the ids made once, and the
 * maps and lists that grow one entry per item. The maps and the list are
 * mutated in place by the functions below, which is why this type is not
 * wrapped in `Readonly`: each one names the mutation in its own name.
 */
export type ItemWriteContext = {
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
  const burstId = await ensureBurst({
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
    burst_id: burstId ?? null,
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
  // A loop because each insert is awaited before the next begins: one SQLite
  // writer, and a `map` over an async function would start them all at once.
  for (const rendition of makeRenditionsFromItem(item)) {
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
  // Both loops await each insert before the next begins, for the one writer.
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

/** Assembles the mutable context threaded through writing every item. */
export function makeItemWriteContext(options: {
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

/** Writes every planned item: its row, its renditions, its tags and people. */
export async function writeItems(options: {
  database: Kysely<Database>;
  plan: ArchivePlan;
  context: ItemWriteContext;
}): Promise<void> {
  const { database, plan, context } = options;
  // A loop because each item is finished before the next is started, which
  // is the one exception the TypeScript rules make: a burst row has to exist
  // before the frames that point at it, `seq` and `burst_index` are read off
  // what has been written so far, and better-sqlite3 has a single writer, so
  // a `map` over an async function would be a different program and a slower
  // one.
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
