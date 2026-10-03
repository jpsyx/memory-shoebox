import type {
  Kysely,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { settleUploadSession } from "../../src/upload/settleUploadSession.ts";
import {
  NOW,
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertUploadFile,
  insertUploadSession,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** The four states a file can end in. */
const TERMINAL_STATES = ["done", "failed", "refused", "cancelled"] as const;

/** Every ordering of `values`: 24 for four. */
function _permutationsOf<Value>(values: readonly Value[]): Value[][] {
  if (values.length <= 1) {
    return [[...values]];
  }
  return values.flatMap((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    return _permutationsOf(rest).map((permutation) => {
      return [value, ...permutation];
    });
  });
}

/** A migrated database with a base URL, an uploader and one other member. */
async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example.com",
  });
  const uploaderId = await insertMember(database, { display_name: "Papá" });
  const rosaId = await insertMember(database, { display_name: "Rosa" });
  return { database, uploaderId, rosaId };
}

/** Settles in its own `BEGIN IMMEDIATE`, as every real caller does. */
async function _settle(options: {
  database: Kysely<Database>;
  sessionId: string;
  now?: string;
}): Promise<boolean> {
  const { didSettle } = await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      return settleUploadSession({
        transaction,
        sessionId: options.sessionId,
        now: options.now ?? NOW,
      });
    },
  });
  return didSettle;
}

/** A handle that writes down which table each `INSERT` targets, in order. */
function _recordInsertedTables(database: Kysely<Database>): {
  database: Kysely<Database>;
  insertedTables: string[];
} {
  const insertedTables: string[] = [];
  const plugin: KyselyPlugin = {
    transformQuery: (args: PluginTransformQueryArgs): RootOperationNode => {
      if (args.node.kind === "InsertQueryNode" && args.node.into) {
        insertedTables.push(args.node.into.table.identifier.name);
      }
      return args.node;
    },
    transformResult: (
      args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> => {
      return Promise.resolve(args.result);
    },
  };
  return { database: database.withPlugin(plugin), insertedTables };
}

/** A committed batch of three frames four seconds apart, all `done`. */
async function _insertSettleableBurst(options: {
  database: Kysely<Database>;
  uploaderId: string;
}): Promise<{ sessionId: string; itemIds: string[] }> {
  const sessionId = await insertUploadSession(options.database, {
    uploadedBy: options.uploaderId,
  });
  const itemIds = await Promise.all(
    [0, 4, 8].map(async (offsetSeconds, index) => {
      await insertUploadFile(options.database, {
        uploadSessionId: sessionId,
        position: index,
        state: "done",
      });
      return insertItem(options.database, {
        uploadedBy: options.uploaderId,
        upload_session_id: sessionId,
        captured_on: "2026-09-14",
        captured_at: `2026-09-14T06:41:0${offsetSeconds}.000Z`,
        seq: index,
      });
    }),
  );
  return { sessionId, itemIds };
}

describe("settleUploadSession", () => {
  it("fires exactly once under every order the four terminal states can land in", async () => {
    const { database, uploaderId } = await _createContext();
    const orders = _permutationsOf([0, 1, 2, 3]);

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
        settledAfter.push(await _settle({ database, sessionId }));
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

  it("waits while any file is still waiting or sending", async () => {
    const { database, uploaderId } = await _createContext();
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

    expect(await _settle({ database, sessionId })).toBe(false);
    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({ state: "uploading", settled_at: null });
    await database.destroy();
  });

  it("never settles an uncommitted draft, however terminal its files are", async () => {
    const { database, uploaderId } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
      state: "draft",
      committed_at: null,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "refused",
    });

    expect(await _settle({ database, sessionId })).toBe(false);
    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({ state: "draft", settled_at: null });
    await database.destroy();
  });

  it("does nothing on a second call, so a retry after settling sends nothing", async () => {
    const { database, uploaderId } = await _createContext();
    const { sessionId, itemIds } = await _insertSettleableBurst({
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

    expect(await _settle({ database, sessionId })).toBe(true);
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
      await _settle({ database, sessionId, now: "2026-09-27T11:00:00.000Z" }),
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
    const { database, uploaderId } = await _createContext();
    const { sessionId } = await _insertSettleableBurst({
      database,
      uploaderId,
    });

    const outcomes = await Promise.all([
      _settle({ database, sessionId }),
      _settle({ database, sessionId }),
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
    const context = await _createContext();
    const { database, insertedTables } = _recordInsertedTables(
      context.database,
    );
    const { sessionId, itemIds } = await _insertSettleableBurst({
      database,
      uploaderId: context.uploaderId,
    });
    insertedTables.length = 0;

    expect(await _settle({ database, sessionId })).toBe(true);

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
    const { database, uploaderId } = await _createContext();
    const { sessionId } = await _insertSettleableBurst({
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

  it("records how many people the fan-out wrote to, and when", async () => {
    const { database, uploaderId } = await _createContext();
    const { sessionId } = await _insertSettleableBurst({
      database,
      uploaderId,
    });

    await _settle({ database, sessionId });

    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at", "notified_member_count", "notified_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      state: "settled",
      settled_at: NOW,
      notified_member_count: 1,
      notified_at: NOW,
    });
    await database.destroy();
  });

  it("settles a batch nobody else can see with a count of zero", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "failed",
    });

    expect(await _settle({ database, sessionId })).toBe(true);

    const session = await database
      .selectFrom("upload_sessions")
      .select(["notified_member_count", "notified_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({ notified_member_count: 0, notified_at: NOW });
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toEqual([]);
    await database.destroy();
  });

  it("forms bursts only among items a camera dated, never from an invented clock", async () => {
    const { database, uploaderId } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "done",
    });
    let seq = 0;
    const insertFrame = (options: {
      captureSource: string;
      capturedAt: string;
      kind?: "photo" | "video";
    }): Promise<string> => {
      seq += 1;
      return insertItem(database, {
        uploadedBy: uploaderId,
        upload_session_id: sessionId,
        captured_on: "2026-09-14",
        captured_at: options.capturedAt,
        capture_source: options.captureSource,
        kind: options.kind ?? "photo",
        seq,
      });
    };

    // A camera run: two photographs and a video, inside the gap.
    const cameraItemIds = [
      await insertFrame({
        captureSource: "exif",
        capturedAt: "2026-09-14T06:41:00.000Z",
      }),
      await insertFrame({
        captureSource: "exif",
        capturedAt: "2026-09-14T06:41:04.000Z",
      }),
      await insertFrame({
        captureSource: "video_metadata",
        capturedAt: "2026-09-14T06:41:08.000Z",
        kind: "video",
      }),
    ];
    // Two files per invented clock, all sharing one instant that sits inside
    // the camera run's gap, so a missing filter would pull them into it.
    const inventedItemIds: string[] = [];
    for (const captureSource of [
      "upload_time",
      "file_mtime",
      "filename",
      "uploader_set",
    ]) {
      for (const _copy of [0, 1]) {
        inventedItemIds.push(
          await insertFrame({
            captureSource,
            capturedAt: "2026-09-14T06:41:06.000Z",
          }),
        );
      }
    }

    expect(await _settle({ database, sessionId })).toBe(true);

    const bursts = await database.selectFrom("bursts").selectAll().execute();
    expect(bursts).toHaveLength(1);
    const burstedItems = await database
      .selectFrom("items")
      .select("id")
      .where("burst_id", "=", bursts[0]?.id ?? "")
      .orderBy("burst_index")
      .execute();
    expect(burstedItems).toEqual(
      cameraItemIds.map((itemId) => {
        return { id: itemId };
      }),
    );
    const inventedItems = await database
      .selectFrom("items")
      .select(["burst_id", "burst_index"])
      .where("id", "in", inventedItemIds)
      .execute();
    expect(inventedItems).toHaveLength(inventedItemIds.length);
    for (const inventedItem of inventedItems) {
      expect(inventedItem).toEqual({ burst_id: null, burst_index: null });
    }
    await database.destroy();
  });

  it("writes no burst at all when every item's clock was invented", async () => {
    const { database, uploaderId } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "done",
    });
    for (const [index, captureSource] of [
      "upload_time",
      "upload_time",
      "file_mtime",
      "filename",
      "uploader_set",
    ].entries()) {
      await insertItem(database, {
        uploadedBy: uploaderId,
        upload_session_id: sessionId,
        captured_on: "2026-09-14",
        captured_at: "2026-09-14T06:41:00.000Z",
        capture_source: captureSource,
        seq: index,
      });
    }

    expect(await _settle({ database, sessionId })).toBe(true);

    expect(await database.selectFrom("bursts").selectAll().execute()).toEqual(
      [],
    );
    const stamped = await database
      .selectFrom("items")
      .select("id")
      .where("burst_id", "is not", null)
      .execute();
    expect(stamped).toEqual([]);
    await database.destroy();
  });
});
