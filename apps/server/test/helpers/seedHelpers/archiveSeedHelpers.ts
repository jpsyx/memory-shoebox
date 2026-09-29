import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { NOW } from "./seedTime.ts";

/**
 * Inserts one stored object for an item and returns its id.
 *
 * Defaults to a thumbnail, which is the rendition every print needs and the
 * one a test that does not care about media still has to have.
 */
export async function insertRendition(
  database: Kysely<Database>,
  options: { itemId: string } & Partial<Database["item_renditions"]>,
): Promise<string> {
  const { itemId, ...overrides } = options;
  const id = overrides.id ?? createId();
  const purpose = overrides.purpose ?? "thumb";
  await database
    .insertInto("item_renditions")
    .values({
      id,
      item_id: itemId,
      purpose,
      // Unique across the table, so two renditions cannot claim one object.
      storage_key: `items/${itemId}/${purpose}.jpg`,
      content_type: "image/jpeg",
      byte_size: 120_000,
      width: 800,
      height: 600,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one tag, normalising its name the way the product does. */
export async function insertTag(
  database: Kysely<Database>,
  options: { name: string } & Partial<Database["tags"]>,
): Promise<string> {
  const { name, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("tags")
    .values({
      id,
      name,
      name_normalized: name.trim().toLowerCase().replace(/\s+/g, " "),
      created_by: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Puts one tag on one item. */
export async function insertItemTag(
  database: Kysely<Database>,
  options: { itemId: string; tagId: string } & Partial<Database["item_tags"]>,
): Promise<string> {
  const { itemId, tagId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_tags")
    .values({
      id,
      item_id: itemId,
      tag_id: tagId,
      tagged_by: null,
      tagged_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one person, member or not, and returns their id. */
export async function insertPerson(
  database: Kysely<Database>,
  options: { displayName: string } & Partial<Database["people"]>,
): Promise<string> {
  const { displayName, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("people")
    .values({
      id,
      display_name: displayName,
      member_id: null,
      preferred_face_item_id: null,
      created_by: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Tags one person in one item. */
export async function insertItemPerson(
  database: Kysely<Database>,
  options: { itemId: string; personId: string } & Partial<
    Database["item_people"]
  >,
): Promise<string> {
  const { itemId, personId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_people")
    .values({
      id,
      item_id: itemId,
      person_id: personId,
      tagged_by: null,
      tagged_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/**
 * Inserts one occasion.
 *
 * `endsOn` defaults to `startsOn`, which is how a one-day occasion is spelled:
 * `ends_on` is never null, and that one shape is the span model.
 */
export async function insertMilestone(
  database: Kysely<Database>,
  options: { name: string; startsOn: string } & Partial<
    Database["milestones"]
  > & { endsOn?: string },
): Promise<string> {
  const { name, startsOn, endsOn, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("milestones")
    .values({
      id,
      name,
      starts_on: startsOn,
      ends_on: endsOn ?? startsOn,
      blurb: null,
      created_by: null,
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Attaches one item to one occasion. */
export async function insertItemMilestone(
  database: Kysely<Database>,
  options: { itemId: string; milestoneId: string } & Partial<
    Database["item_milestones"]
  >,
): Promise<string> {
  const { itemId, milestoneId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_milestones")
    .values({
      id,
      item_id: itemId,
      milestone_id: milestoneId,
      attached_by: null,
      attached_at: NOW,
      span_mismatch_acknowledged_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/**
 * Inserts one burst and returns its id.
 *
 * `cover_item_id` is left null, because the frames do not exist yet: a cover
 * is set afterwards with {@link setBurstCover}.
 */
export async function insertBurst(
  database: Kysely<Database>,
  options: { uploadSessionId: string; capturedOn: string } & Partial<
    Database["bursts"]
  >,
): Promise<string> {
  const { uploadSessionId, capturedOn, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("bursts")
    .values({
      id,
      upload_session_id: uploadSessionId,
      captured_on: capturedOn,
      starts_at: `${capturedOn}T06:41:00.000Z`,
      ends_at: `${capturedOn}T06:44:00.000Z`,
      detector_version: 1,
      threshold_seconds: 10,
      detected_at: NOW,
      is_manual: 0,
      cover_item_id: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Names one frame as a burst's cover, after that frame exists. */
export async function setBurstCover(
  database: Kysely<Database>,
  options: { burstId: string; coverItemId: string },
): Promise<void> {
  await database
    .updateTable("bursts")
    .set({ cover_item_id: options.coverItemId })
    .where("id", "=", options.burstId)
    .execute();
}

/** Marks one item as seen by one member, the way the latch would. */
export async function insertItemView(
  database: Kysely<Database>,
  options: { memberId: string; itemId: string } & Partial<
    Database["item_views"]
  >,
): Promise<string> {
  const { memberId, itemId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_views")
    .values({
      id,
      member_id: memberId,
      item_id: itemId,
      first_seen_at: NOW,
      first_opened_at: null,
      last_opened_at: null,
      open_count: 0,
      ...overrides,
    })
    .execute();
  return id;
}
