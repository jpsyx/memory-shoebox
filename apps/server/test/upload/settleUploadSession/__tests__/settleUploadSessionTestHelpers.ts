import type {
  Kysely,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from "kysely";

import { createDatabase } from "../../../../src/db/client.ts";
import { migrateToLatest } from "../../../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../../../src/db/types/db.types.ts";
import { settleUploadSession } from "../../../../src/upload/settleUploadSession.ts";
import {
  NOW,
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertUploadFile,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** The four states a file can end in. */
export const TERMINAL_STATES = [
  "done",
  "failed",
  "refused",
  "cancelled",
] as const;

/** Every ordering of `values`: 24 for four. */
export function makePermutationsFromValues<Value>(
  values: readonly Value[],
): Value[][] {
  if (values.length <= 1) {
    return [[...values]];
  }
  return values.flatMap((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    return makePermutationsFromValues(rest).map((permutation) => {
      return [value, ...permutation];
    });
  });
}

/** A migrated database with a base URL, an uploader and one other member. */
export async function createContext(): Promise<{
  database: Kysely<Database>;
  uploaderId: string;
  rosaId: string;
}> {
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
export async function settle(
  options: Readonly<{
    database: Kysely<Database>;
    sessionId: string;
    now?: string;
  }>,
): Promise<boolean> {
  const { didSettle } = await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const { now = NOW } = options;
      return settleUploadSession({
        transaction,
        sessionId: options.sessionId,
        now: now,
      });
    },
  });
  return didSettle;
}

/** A handle that writes down which table each `INSERT` targets, in order. */
export function recordInsertedTables(database: Kysely<Database>): {
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
export async function insertSettleableBurst(
  options: Readonly<{
    database: Kysely<Database>;
    uploaderId: string;
  }>,
): Promise<{ sessionId: string; itemIds: string[] }> {
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
