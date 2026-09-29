import { describe, expect, it } from "vitest";
import { readMediaSources } from "../../src/archive/readMediaSources.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
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
      url: `https://b2.test/get/${encodeURIComponent(`items/${drawnId}/thumb.jpg`)}`,
      // One hour after the request's own clock, so the client can refetch in
      // time rather than discovering a dead URL.
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
      url: `https://b2.test/get/${encodeURIComponent(`items/${firstId}/thumb.jpg`)}`,
      expiresAt: "2026-09-27T11:00:00.000Z",
      width: 800,
      height: 600,
    });
    expect(sources.get(secondId)?.get("thumb")).toEqual({
      url: `https://b2.test/get/${encodeURIComponent(`items/${secondId}/thumb.jpg`)}`,
      expiresAt: "2026-09-27T11:00:00.000Z",
      width: 800,
      height: 600,
    });

    await database.destroy();
  });

  it("runs nothing for no ids", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const sources = await readMediaSources({
      database,
      b2: createFakeB2Client(),
      itemIds: [],
      now: new Date(NOW),
      ttlSeconds: 3600,
    });
    expect(sources.size).toBe(0);
    await database.destroy();
  });
});
