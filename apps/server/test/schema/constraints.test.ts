import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Kysely } from "kysely";

let database: Kysely<Database>;

beforeEach(async () => {
  database = createDatabase(":memory:");
  await migrateToLatest(database);
});

afterEach(async () => {
  await database.destroy();
});

/**
 * Inserts the rows `items` needs before it will accept one of its own, and
 * returns an `items` row with every `NOT NULL` column filled in.
 *
 * The enum tests below want the `CHECK` on `capture_source` to be the thing
 * that rejects a row, so everything else about the row has to be valid.
 */
async function _buildValidItem(): Promise<Record<string, string | number>> {
  const now = "2026-09-14T06:41:00.000Z";
  await sql`
    INSERT INTO members (id, email, role, status, notify_on_upload,
                         notify_on_comment, notify_on_reply, notify_on_removal,
                         created_at)
    VALUES ('member-enum', 'enum@example.test', 'uploader', 'active',
            1, 1, 1, 1, ${now})
  `.execute(database);

  return {
    id: "item-enum",
    kind: "photo",
    captured_at: now,
    captured_on: "2026-09-14",
    capture_source: "uploader_set",
    original_captured_at: now,
    seq: 1,
    uploaded_by: "member-enum",
    visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
    width: 4032,
    height: 3024,
    byte_size: 2_486_912,
    content_type: "image/jpeg",
    created_at: now,
  };
}

/**
 * Writes one `items` row with `capture_source` overridden.
 *
 * @returns The number of rows written, which is 1 when the value was accepted.
 */
async function _insertItemWithCaptureSource(
  captureSource: string,
): Promise<number> {
  const row = await _buildValidItem();
  const result = await database
    .insertInto("items")
    .values({ ...row, capture_source: captureSource } as never)
    .execute();
  return Number(result[0]?.numInsertedOrUpdatedRows ?? 0);
}

/**
 * Writes one `item_capture_date_changes` row with `reason` overridden, having
 * first written the `items` row it hangs off.
 *
 * @returns The number of change rows written.
 */
async function _insertCaptureDateChangeWithReason(
  reason: string,
): Promise<number> {
  const row = await _buildValidItem();
  await database
    .insertInto("items")
    .values(row as never)
    .execute();
  const now = "2026-09-14T06:41:00.000Z";
  const result = await database
    .insertInto("item_capture_date_changes")
    .values({
      id: "change-enum",
      item_id: "item-enum",
      milestone_id: null,
      previous_captured_at: now,
      previous_capture_date: "2026-09-14",
      previous_capture_source: "exif",
      new_captured_at: "2026-09-15T06:41:00.000Z",
      new_capture_date: "2026-09-15",
      changed_by: "member-enum",
      changed_at: now,
      reason,
    } as never)
    .execute();
  return Number(result[0]?.numInsertedOrUpdatedRows ?? 0);
}

/** Writes the member and the `items` row a removal request hangs off. */
async function _insertItemForRemovalRequest(): Promise<void> {
  const row = await _buildValidItem();
  await database
    .insertInto("items")
    .values(row as never)
    .execute();
}

/**
 * Builds one `removal_requests` row in the given state against the given item.
 *
 * `resolved_at` and `resolved_by_member_id` track `state`, because
 * `removal_requests_resolves_once` insists an open request carries neither and
 * a settled one carries a timestamp. Everything else is filled in so that the
 * only thing a rejection can be about is `item_id`.
 *
 * @param itemId The photograph the request names, or null for a request whose
 *   photograph is already gone.
 * @param state One of the four states the enum allows.
 * @returns The row, ready to insert.
 */
function _buildRemovalRequest(
  itemId: string | null,
  state: string,
): Record<string, string | null> {
  const now = "2026-09-14T06:41:00.000Z";
  const isOpen = state === "open";
  return {
    id: "removal-open-check",
    item_id: itemId,
    requested_by_member_id: "member-enum",
    reason: "That is me in the background.",
    state,
    decline_reason: null,
    created_at: now,
    resolved_at: isOpen ? null : now,
    resolved_by_member_id: isOpen ? null : "member-enum",
    item_uploader_member_id: "member-enum",
    item_captured_at: now,
    item_storage_key: "items/item-enum/original.jpg",
  };
}

/**
 * Writes the item, then one removal request against it.
 *
 * @returns The number of request rows written, which is 1 when accepted.
 */
async function _insertRemovalRequest(
  itemId: string | null,
  state: string,
): Promise<number> {
  await _insertItemForRemovalRequest();
  const result = await database
    .insertInto("removal_requests")
    .values(_buildRemovalRequest(itemId, state) as never)
    .execute();
  return Number(result[0]?.numInsertedOrUpdatedRows ?? 0);
}

/** Settles the one removal request the tests below write, as a deletion. */
async function _settleRemovalRequest(): Promise<void> {
  await database
    .updateTable("removal_requests")
    .set({
      state: "deleted",
      resolved_at: "2026-09-14T07:02:00.000Z",
      resolved_by_member_id: "member-enum",
    } as never)
    .where("id", "=", "removal-open-check")
    .execute();
}

describe("the two lookalike capture enums", () => {
  // `items.capture_source` records **how** a capture date was arrived at;
  // `item_capture_date_changes.reason` records **why** one was changed. They
  // look like the same enum and are not: a hand correction lands on the item
  // as `capture_source = 'uploader_set'` and is recorded on the change row as
  // `reason = 'manual'`. Swapping them type-checks green, passes every other
  // test, and two API slices misread the pair once already.
  //
  // The assertions name the constraint in the error, so a row rejected for
  // some other reason (a missing column, a foreign key) cannot pass for the
  // `CHECK` doing its job.

  it("rejects 'manual' on items.capture_source", async () => {
    await expect(_insertItemWithCaptureSource("manual")).rejects.toThrow(
      /CHECK constraint failed: capture_source/i,
    );
  });

  it("accepts 'uploader_set' on items.capture_source", async () => {
    await expect(_insertItemWithCaptureSource("uploader_set")).resolves.toBe(1);
  });

  it("accepts 'manual' on item_capture_date_changes.reason", async () => {
    await expect(_insertCaptureDateChangeWithReason("manual")).resolves.toBe(1);
  });

  it("rejects 'uploader_set' on item_capture_date_changes.reason", async () => {
    await expect(
      _insertCaptureDateChangeWithReason("uploader_set"),
    ).rejects.toThrow(/CHECK constraint failed: reason/i);
  });
});

describe("the constraint that an open request names a photograph", () => {
  // `item_id` is `SET NULL`, the one exception in the cascade matrix, so
  // takedown history survives the takedown. The cost is that
  // `removal_requests__one_open_per_asker` stops enforcing anything the moment
  // the column goes null, because SQLite counts distinct nulls as distinct
  // inside a unique index. Migration 0009's `CHECK` closes that by making the
  // null legal only once the request is settled.

  it("rejects an open request with no item", async () => {
    await expect(_insertRemovalRequest(null, "open")).rejects.toThrow(
      /CHECK constraint failed: removal_requests_open_has_item/i,
    );
  });

  it("accepts an open request against a real item", async () => {
    await expect(_insertRemovalRequest("item-enum", "open")).resolves.toBe(1);
  });

  it("accepts a settled request with no item, which is what SET NULL leaves", async () => {
    await expect(_insertRemovalRequest(null, "withdrawn")).resolves.toBe(1);
  });
});

describe("deleting a photograph somebody has asked to have taken down", () => {
  // The end of the argument. The prose contract in `data-models.md` says
  // deleting acts on every open request for that item, and before migration
  // 0009 nothing held anyone to it: the `SET NULL` fired, the request stayed
  // open with a null `item_id`, and the partial unique could no longer see it.

  it("fails while a request is still open, rather than leaving an unpoliceable row", async () => {
    await _insertRemovalRequest("item-enum", "open");

    await expect(
      database.deleteFrom("items").where("id", "=", "item-enum").execute(),
    ).rejects.toThrow(
      /CHECK constraint failed: removal_requests_open_has_item/i,
    );
  });

  it("succeeds once the request is settled, and the request outlives the item", async () => {
    await _insertRemovalRequest("item-enum", "open");
    await _settleRemovalRequest();

    await database.deleteFrom("items").where("id", "=", "item-enum").execute();

    const survivor = await database
      .selectFrom("removal_requests")
      .selectAll()
      .executeTakeFirst();
    expect(survivor?.state).toBe("deleted");
    expect(survivor?.item_id).toBeNull();
    // The snapshot columns are what a settled card still renders.
    expect(survivor?.item_storage_key).toBe("items/item-enum/original.jpg");
  });
});
