import {
  TERMINAL_STATES,
  makePermutationsFromValues,
  createContext,
  settle,
  recordInsertedTables,
  insertSettleableBurst,
} from "./settleUploadSessionTestHelpers.ts";

import { describe, expect, it } from "vitest";

import { runInImmediateTransaction } from "../../../../src/db/runInImmediateTransaction.ts";

import { settleUploadSession } from "../../../../src/upload/settleUploadSession.ts";
import {
  NOW,
  insertItem,
  insertUploadFile,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("settleUploadSession", () => {
  it("fires exactly once under every order the four terminal states can land in", async () => {
    const { database, uploaderId } = await createContext();
    const orders = makePermutationsFromValues([0, 1, 2, 3]);

    // One batch per ordering, each settled after every single transition.
    // Sequential on purpose: each transition must land before the latch
    // that follows it runs, which is the whole property under test.
    for (const [orderIndex, order] of orders.entries()) {
      const sessionId = await insertUploadSession(database, {
        uploadedBy: uploaderId,
      });
      const fileIds = await Promise.all(
        TERMINAL_STATES.map((_state, position) => {
          return insertUploadFile(database, {
            uploadSessionId: sessionId,
            position,
          });
        }),
      );
      await insertItem(database, {
        uploadedBy: uploaderId,
        upload_session_id: sessionId,
        seq: orderIndex,
      });

      const settledAfter: boolean[] = [];
      for (const fileIndex of order) {
        await database
          .updateTable("upload_files")
          .set({ state: TERMINAL_STATES[fileIndex] })
          .where("id", "=", fileIds[fileIndex] ?? "")
          .execute();
        settledAfter.push(await settle({ database, sessionId }));
      }

      expect(settledAfter).toEqual([false, false, false, true]);
      const emails = await database
        .selectFrom("outbound_emails")
        .select("id")
        .where("trigger_id", "=", sessionId)
        .execute();
      expect(emails).toHaveLength(1);
    }
    await database.destroy();
  });

  it("leaves the session uploading while a file is still sending", async () => {
    const { database, uploaderId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 0,
      state: "done",
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "sending",
    });

    expect(await settle({ database, sessionId })).toBe(false);
    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({ state: "uploading", settled_at: null });
    await database.destroy();
  });

  it("never settles an uncommitted draft, however terminal its files are", async () => {
    const { database, uploaderId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
      state: "draft",
      committed_at: null,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "refused",
    });

    expect(await settle({ database, sessionId })).toBe(false);
    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({ state: "draft", settled_at: null });
    await database.destroy();
  });

  it("does nothing on a second call, so a retry after settling sends nothing", async () => {
    const { database, uploaderId } = await createContext();
    const { sessionId, itemIds } = await insertSettleableBurst({
      database,
      uploaderId,
    });
    const readSettleState = async () => {
      return {
        session: await database
          .selectFrom("upload_sessions")
          .select([
            "state",
            "settled_at",
            "notified_at",
            "notified_member_count",
          ])
          .where("id", "=", sessionId)
          .executeTakeFirstOrThrow(),
        frames: await database
          .selectFrom("items")
          .select(["id", "burst_id", "burst_index"])
          .where("id", "in", itemIds)
          .orderBy("burst_index")
          .execute(),
        bursts: await database.selectFrom("bursts").selectAll().execute(),
        emails: await database
          .selectFrom("outbound_emails")
          .selectAll()
          .execute(),
      };
    };

    expect(await settle({ database, sessionId })).toBe(true);
    const before = await readSettleState();
    expect(before.emails).toHaveLength(1);

    // A retried file lands after the batch settled: a new frame inside the
    // burst's gap, which a second detection would absorb and renumber.
    const recoveredItemId = await insertItem(database, {
      uploadedBy: uploaderId,
      upload_session_id: sessionId,
      captured_on: "2026-09-14",
      captured_at: "2026-09-14T06:41:12.000Z",
      seq: 3,
    });
    expect(
      await settle({ database, sessionId, now: "2026-09-27T11:00:00.000Z" }),
    ).toBe(false);

    expect(await readSettleState()).toEqual(before);
    const recoveredItem = await database
      .selectFrom("items")
      .select(["burst_id", "burst_index"])
      .where("id", "=", recoveredItemId)
      .executeTakeFirstOrThrow();
    expect(recoveredItem).toEqual({ burst_id: null, burst_index: null });
    await database.destroy();
  });

  it("settles once when two callers race for the last file", async () => {
    const { database, uploaderId } = await createContext();
    const { sessionId } = await insertSettleableBurst({
      database,
      uploaderId,
    });

    const outcomes = await Promise.all([
      settle({ database, sessionId }),
      settle({ database, sessionId }),
    ]);

    expect(outcomes.toSorted()).toEqual([false, true]);
    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .where("trigger_id", "=", sessionId)
      .execute();
    expect(emails).toHaveLength(1);
    expect(
      await database.selectFrom("bursts").selectAll().execute(),
    ).toHaveLength(1);
    await database.destroy();
  });

  it("detects the burst before it enqueues the email", async () => {
    const context = await createContext();
    const { database, insertedTables } = recordInsertedTables(context.database);
    const { sessionId, itemIds } = await insertSettleableBurst({
      database,
      uploaderId: context.uploaderId,
    });
    insertedTables.length = 0;

    expect(await settle({ database, sessionId })).toBe(true);

    expect(insertedTables.indexOf("bursts")).toBeGreaterThanOrEqual(0);
    expect(insertedTables.indexOf("bursts")).toBeLessThan(
      insertedTables.indexOf("outbound_emails"),
    );
    const burst = await database
      .selectFrom("bursts")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(burst).toMatchObject({
      upload_session_id: sessionId,
      captured_on: "2026-09-14",
      starts_at: "2026-09-14T06:41:00.000Z",
      ends_at: "2026-09-14T06:41:08.000Z",
      detector_version: 1,
      threshold_seconds: 10,
      detected_at: NOW,
      is_manual: 0,
      cover_item_id: null,
    });
    const frames = await database
      .selectFrom("items")
      .select(["id", "burst_id", "burst_index"])
      .where("upload_session_id", "=", sessionId)
      .orderBy("burst_index")
      .execute();
    expect(frames).toEqual(
      itemIds.map((itemId, index) => {
        return { id: itemId, burst_id: burst.id, burst_index: index + 1 };
      }),
    );
    await database.destroy();
  });

  it("writes everything in the caller's transaction, so a rollback takes all of it", async () => {
    const { database, uploaderId } = await createContext();
    const { sessionId } = await insertSettleableBurst({
      database,
      uploaderId,
    });

    await expect(
      runInImmediateTransaction({
        database,
        callback: async (transaction) => {
          await settleUploadSession({ transaction, sessionId, now: NOW });
          throw new Error("the caller's next write failed");
        },
      }),
    ).rejects.toThrow("the caller's next write failed");

    const session = await database
      .selectFrom("upload_sessions")
      .select(["settled_at", "notified_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({ settled_at: null, notified_at: null });
    expect(await database.selectFrom("bursts").selectAll().execute()).toEqual(
      [],
    );
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toEqual([]);
    await database.destroy();
  });
});
