import { describe, expect, it } from "vitest";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilterHelpers.ts";
import { readTimelinePage } from "../../src/archive/readTimelinePage.ts";
import { readMediaSources } from "../../src/archive/readMediaSources.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client/createFakeB2Client.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readMediaSources", () => {
  it("signs every rendition of the ids it was given, and no others", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const drawnId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const otherId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    await insertRendition(database, { itemId: drawnId, purpose: "thumb" });
    await insertRendition(database, { itemId: drawnId, purpose: "display" });
    await insertRendition(database, { itemId: otherId, purpose: "thumb" });

    const sources = await readMediaSources({
      database,
      b2: createFakeB2Client(),
      itemIds: [drawnId],
      now: new Date(NOW),
      ttlSeconds: 3600,
    });

    expect([...sources.keys()]).toEqual([drawnId]);
    expect([...(sources.get(drawnId)?.keys() ?? [])].sort()).toEqual([
      "display",
      "thumb",
    ]);
    expect(sources.get(drawnId)?.get("thumb")).toEqual({
      url: `https://b2.test/get/${encodeURIComponent(`items/${drawnId}/thumb.jpg`)}?issuedAt=2026-09-27T10%3A00%3A00.000Z&expiresInSeconds=3600`,
      // One hour after actual signature issuance, preserved across reuse.
      expiresAt: "2026-09-27T11:00:00.000Z",
      width: 800,
      height: 600,
    });

    await database.destroy();
  });

  it("batches two drawn items, returning each one's own renditions", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const firstId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const secondId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    await insertRendition(database, { itemId: firstId, purpose: "thumb" });
    await insertRendition(database, { itemId: firstId, purpose: "display" });
    await insertRendition(database, { itemId: secondId, purpose: "thumb" });

    const sources = await readMediaSources({
      database,
      b2: createFakeB2Client(),
      itemIds: [firstId, secondId],
      now: new Date(NOW),
      ttlSeconds: 3600,
    });

    expect([...sources.keys()].sort()).toEqual([firstId, secondId].sort());
    expect([...(sources.get(firstId)?.keys() ?? [])].sort()).toEqual([
      "display",
      "thumb",
    ]);
    expect([...(sources.get(secondId)?.keys() ?? [])]).toEqual(["thumb"]);
    expect(sources.get(firstId)?.get("thumb")).toEqual({
      url: `https://b2.test/get/${encodeURIComponent(`items/${firstId}/thumb.jpg`)}?issuedAt=2026-09-27T10%3A00%3A00.000Z&expiresInSeconds=3600`,
      expiresAt: "2026-09-27T11:00:00.000Z",
      width: 800,
      height: 600,
    });
    expect(sources.get(secondId)?.get("thumb")).toEqual({
      url: `https://b2.test/get/${encodeURIComponent(`items/${secondId}/thumb.jpg`)}?issuedAt=2026-09-27T10%3A00%3A00.000Z&expiresInSeconds=3600`,
      expiresAt: "2026-09-27T11:00:00.000Z",
      width: 800,
      height: 600,
    });

    await database.destroy();
  });

  it("runs nothing for no ids", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const counting = makeQueryCountingDatabaseFromDatabase(database);
    counting.reset();

    const sources = await readMediaSources({
      database: counting.database,
      b2: createFakeB2Client(),
      itemIds: [],
      now: new Date(NOW),
      ttlSeconds: 3600,
    });

    expect(sources.size).toBe(0);
    expect(counting.getQueryCount()).toBe(0);
    await database.destroy();
  });
  it("keeps the real issuance expiry when an authorized read reuses its source", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      const memberId = await insertMember(database);
      const itemId = await insertItem(database, { uploadedBy: memberId });
      await insertRendition(database, { itemId, purpose: "thumb" });
      const options = {
        database,
        b2: createFakeB2Client(),
        itemIds: [itemId],
        ttlSeconds: 3600,
      };
      const first = await readMediaSources({ ...options, now: new Date(NOW) });
      const second = await readMediaSources({
        ...options,
        now: new Date(Date.parse(NOW) + 120000),
      });
      expect(second.get(itemId)?.get("thumb")).toEqual(
        first.get(itemId)?.get("thumb"),
      );
    } finally {
      await database.destroy();
    }
  });

  it("returns no source after a warmed item becomes invisible to the viewer", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      const uploaderId = await insertMember(database, { role: "uploader" });
      const viewerId = await insertMember(database);
      const itemId = await insertItem(database, { uploadedBy: uploaderId });
      await insertRendition(database, { itemId, purpose: "thumb" });
      const b2 = createFakeB2Client();
      const options = {
        database,
        b2,
        viewer: {
          memberId: viewerId,
          sessionId: "test-session",
          role: "viewer" as const,
          isAdmin: false,
          visibleRuleIds: ["visibility-rule-everyone"],
        },
        filter: makeTimelineFilterFromQuery({}),
        limit: 10,
        cursor: undefined,
        now: new Date(NOW),
      };
      const warmed = await readTimelinePage(options);
      expect(warmed.days[0]?.items).toHaveLength(1);
      const callsBeforeRestriction = b2.calls.length;
      const hiddenRuleId = await insertVisibilityRule(database, {
        mode: "only",
      });
      await database
        .updateTable("items")
        .set({ visibility_rule_id: hiddenRuleId })
        .where("id", "=", itemId)
        .execute();
      const restricted = await readTimelinePage({
        ...options,
        now: new Date(Date.parse(NOW) + 120000),
      });
      expect(restricted.days).toEqual([]);
      expect(b2.calls).toHaveLength(callsBeforeRestriction);
    } finally {
      await database.destroy();
    }
  });
});
