import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { readBurstFrameRefs } from "../../src/items/readBurstFrameRefs.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertRendition,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const VIEWER_BASE = {
  sessionId: "session",
  role: "viewer",
  isAdmin: false,
  visibleRuleIds: ["visibility-rule-everyone"],
} as const;

describe("readBurstFrameRefs", () => {
  it("numbers the visible frames densely, whatever the stored index says", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const viewerMemberId = await insertMember(database, { role: "viewer" });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const hiddenRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });

    const frameIds = await Promise.all(
      [1, 2, 3].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: uploaderId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_on: "2026-09-14",
          // The middle frame is restricted, so the stored indexes run 1, 3.
          visibility_rule_id:
            index === 2 ? hiddenRuleId : "visibility-rule-everyone",
        });
        await insertRendition(database, { itemId });
        return itemId;
      }),
    );

    const frames = await readBurstFrameRefs({
      database,
      b2: createFakeB2Client(),
      viewer: { ...VIEWER_BASE, memberId: viewerMemberId },
      burstId,
      now: new Date(NOW),
      limit: 200,
    });

    expect(
      frames.map((frame) => {
        return frame.position;
      }),
    ).toEqual([1, 2]);
    expect(
      frames.map((frame) => {
        return frame.itemId;
      }),
    ).toEqual([frameIds[0], frameIds[2]]);
    await database.destroy();
  });

  it("composes each frame's alt text from that frame's own people", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      burst_id: burstId,
      burst_index: 1,
      captured_at: "2026-09-14T04:41:00.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });

    const [frame] = await readBurstFrameRefs({
      database,
      b2: createFakeB2Client(),
      viewer: { ...VIEWER_BASE, memberId: uploaderId },
      burstId,
      now: new Date(NOW),
      limit: 200,
    });

    expect(frame?.altText).toBe("14 September 2026");
    await database.destroy();
  });

  it("returns nothing when the viewer can see no frame", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const viewerMemberId = await insertMember(database, { role: "viewer" });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });
    const hiddenRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      burst_id: burstId,
      burst_index: 1,
      visibility_rule_id: hiddenRuleId,
    });
    await insertRendition(database, { itemId });

    expect(
      await readBurstFrameRefs({
        database,
        b2: createFakeB2Client(),
        viewer: { ...VIEWER_BASE, memberId: viewerMemberId },
        burstId,
        now: new Date(NOW),
        limit: 200,
      }),
    ).toEqual([]);
    await database.destroy();
  });

  it("stays dense when a visible frame has no rendition to show", async () => {
    // A frame that passes the visibility predicate but carries no rendition
    // row is a data problem (a missing rendition), not a permission one. It
    // must not open a gap in `position`: a gap reads to the viewer as "there
    // is a frame here you may not open", which is exactly the leak `position`
    // exists to prevent, whatever actually caused the row to be dropped.
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });

    const frameIds = await Promise.all(
      [1, 2, 3].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: uploaderId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
          captured_on: "2026-09-14",
        });
        // The middle frame gets no rendition row, simulating the ingest
        // defect `readItemSummariesByDay` already tolerates elsewhere.
        if (index !== 2) {
          await insertRendition(database, { itemId });
        }
        return itemId;
      }),
    );

    const frames = await readBurstFrameRefs({
      database,
      b2: createFakeB2Client(),
      viewer: { ...VIEWER_BASE, memberId: uploaderId },
      burstId,
      now: new Date(NOW),
      limit: 200,
    });

    expect(
      frames.map((frame) => {
        return frame.position;
      }),
    ).toEqual([1, 2]);
    expect(
      frames.map((frame) => {
        return frame.itemId;
      }),
    ).toEqual([frameIds[0], frameIds[2]]);
    await database.destroy();
  });

  it("sorts a null burst_index last, ahead of nothing", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId: sessionId,
      capturedOn: "2026-09-14",
    });

    // Inserted with a null index first, so an ordering bug (SQLite's default
    // puts nulls first on ASC) would put it ahead of frame 1 rather than
    // after it.
    const nullIndexItemId = await insertItem(database, {
      uploadedBy: uploaderId,
      seq: 1,
      burst_id: burstId,
      burst_index: null,
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId: nullIndexItemId });
    const firstFrameId = await insertItem(database, {
      uploadedBy: uploaderId,
      seq: 2,
      burst_id: burstId,
      burst_index: 1,
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId: firstFrameId });

    const frames = await readBurstFrameRefs({
      database,
      b2: createFakeB2Client(),
      viewer: { ...VIEWER_BASE, memberId: uploaderId },
      burstId,
      now: new Date(NOW),
      limit: 200,
    });

    expect(
      frames.map((frame) => {
        return frame.itemId;
      }),
    ).toEqual([firstFrameId, nullIndexItemId]);
    await database.destroy();
  });

  it("costs the same number of queries for three frames as for twelve", async () => {
    async function _countQueriesForFrameCount(
      frameCount: number,
    ): Promise<number> {
      const counting = makeQueryCountingDatabaseFromDatabase(
        createDatabase(":memory:"),
      );
      await migrateToLatest(counting.database);
      const uploaderId = await insertMember(counting.database);
      const sessionId = await insertUploadSession(counting.database, {
        uploadedBy: uploaderId,
      });
      const burstId = await insertBurst(counting.database, {
        uploadSessionId: sessionId,
        capturedOn: "2026-09-14",
      });

      await Promise.all(
        Array.from({ length: frameCount }, async (_unused, index) => {
          const itemId = await insertItem(counting.database, {
            uploadedBy: uploaderId,
            seq: index + 1,
            burst_id: burstId,
            burst_index: index + 1,
            captured_on: "2026-09-14",
          });
          await insertRendition(counting.database, { itemId });
        }),
      );

      counting.reset();
      await readBurstFrameRefs({
        database: counting.database,
        b2: createFakeB2Client(),
        viewer: { ...VIEWER_BASE, memberId: uploaderId },
        burstId,
        now: new Date(NOW),
        limit: 200,
      });
      const queryCount = counting.getQueryCount();
      await counting.database.destroy();
      return queryCount;
    }

    const threeFrameQueries = await _countQueriesForFrameCount(3);
    const twelveFrameQueries = await _countQueriesForFrameCount(12);

    expect(twelveFrameQueries).toBe(threeFrameQueries);
  });
});
