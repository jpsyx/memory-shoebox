import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { readBurstCovers } from "../../src/archive/readBurstCovers.ts";
import { readItemsForDays } from "../../src/archive/readItemsForDays.ts";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilter.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertBurst,
  insertItem,
  insertItemView,
  insertMember,
  insertUploadSession,
  setBurstCover,
} from "../helpers/seedHelpers/seedHelpers.ts";

function makeViewer(memberId: string): Viewer {
  return {
    memberId,
    sessionId: "a-session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
}

describe("readItemsForDays", () => {
  let database: Kysely<Database>;
  let memberId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
  });

  it("reads one day oldest first, which is how the day happened", async () => {
    const eveningId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-14T19:55:00.000Z",
      captured_on: "2026-09-14",
    });
    const morningId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_at: "2026-09-14T09:12:00.000Z",
      captured_on: "2026-09-14",
    });

    const rows = await readItemsForDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
      days: ["2026-09-14"],
    });
    expect(
      rows.map((row) => {
        return row.itemId;
      }),
    ).toEqual([morningId, eveningId]);
  });

  it("says which items this viewer has not seen", async () => {
    const seenId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    await insertItemView(database, { memberId, itemId: seenId });
    await insertItem(database, { uploadedBy: memberId, seq: 2 });

    const rows = await readItemsForDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
      days: ["2026-09-27"],
    });
    expect(
      rows.map((row) => {
        return row.isUnseen;
      }),
    ).toEqual([false, true]);
  });

  it("runs no query at all for no days", async () => {
    expect(
      await readItemsForDays({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
        days: [],
      }),
    ).toEqual([]);
  });
});

describe("readBurstCovers", () => {
  it("reads the stored cover, and nothing for a burst without one", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const withCoverId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const withoutCoverId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-13",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      burst_id: withCoverId,
      burst_index: 1,
    });
    await setBurstCover(database, { burstId: withCoverId, coverItemId: itemId });

    const covers = await readBurstCovers({
      database,
      burstIds: [withCoverId, withoutCoverId],
    });
    expect(covers.get(withCoverId)).toBe(itemId);
    expect(covers.get(withoutCoverId)).toBeUndefined();

    await database.destroy();
  });

  it("is empty for no bursts", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    expect((await readBurstCovers({ database, burstIds: [] })).size).toBe(0);
    await database.destroy();
  });
});
