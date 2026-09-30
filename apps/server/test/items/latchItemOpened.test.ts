import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { latchItemOpened } from "../../src/items/latchItemOpened.ts";
import {
  insertItem,
  insertItemView,
  insertMember,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("latchItemOpened", () => {
  it("writes the first open, and counts every one after it", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const later = shiftMinutes({ instant: NOW, minutes: 30 });

    await latchItemOpened({ database, memberId, itemId, now: NOW });
    await latchItemOpened({ database, memberId, itemId, now: later });

    const row = await database
      .selectFrom("item_views")
      .selectAll()
      .where("item_id", "=", itemId)
      .executeTakeFirstOrThrow();

    expect(row.open_count).toBe(2);
    expect(row.first_opened_at).toBe(NOW);
    expect(row.last_opened_at).toBe(later);
    await database.destroy();
  });

  it("keeps the first open when the strip had already latched a sighting", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertItemView(database, { memberId, itemId });
    const later = shiftMinutes({ instant: NOW, minutes: 30 });

    await latchItemOpened({ database, memberId, itemId, now: later });

    const row = await database
      .selectFrom("item_views")
      .selectAll()
      .where("item_id", "=", itemId)
      .executeTakeFirstOrThrow();

    expect(row.first_seen_at).toBe(NOW);
    expect(row.first_opened_at).toBe(later);
    expect(row.open_count).toBe(1);
    await database.destroy();
  });
});
