import type { Selectable } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { VisualFingerprintBackfillOptions } from "../../../src/maintenance/visualFingerprintBackfill/visualFingerprintBackfill.types.ts";
import type { Job } from "../../../src/jobs/createJobRunner.ts";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { createVisualFingerprintBackfillJob } from "../../../src/maintenance/visualFingerprintBackfill/createVisualFingerprintBackfillJob.ts";
import { createFakeB2Client } from "../../helpers/createFakeB2Client/createFakeB2Client.ts";
import { failB2CallsInsideTransactions } from "../../helpers/failB2CallsInsideTransactions/failB2CallsInsideTransactions.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/** Stable evidence independent of the decoder under test elsewhere. */
export const FINGERPRINT = `v1:${"a".repeat(16)}:${"b".repeat(60)}:${"c".repeat(384)}`;

type BackfillTestContext = {
  database: ReturnType<typeof createDatabase>;
  bodies: Map<string, Uint8Array>;
  requestedKeys: string[];
  seed: (purposes?: string[]) => Promise<string>;
  options: VisualFingerprintBackfillOptions & { fetch: typeof fetch };
  callsInsideTransactions: string[];
  makeJob: () => Job;
  setTime: (instant: string) => void;
  readQueue: () => Promise<
    Array<Selectable<Database["photo_fingerprint_backfill"]>>
  >;
  readItem: (id: string) => Promise<Selectable<Database["items"]> | undefined>;
};

/** A real migrated catalog with controlled storage transport and decoder. */
export async function createBackfillTestContext(): Promise<BackfillTestContext> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const b2 = createFakeB2Client();
  const watched = failB2CallsInsideTransactions({ database, b2 });
  const bodies = new Map<string, Uint8Array>();
  const requestedKeys: string[] = [];
  let currentTime = new Date(NOW);
  let sequence = 0;
  const fetchImage: typeof fetch = async (input) => {
    const key = decodeURIComponent(new URL(String(input)).pathname.slice(5));
    requestedKeys.push(key);
    const bytes = bodies.get(key);
    return bytes
      ? new Response(Buffer.from(bytes))
      : new Response(null, { status: 404 });
  };
  const seed = async (purposes = ["original", "display", "thumb"]) => {
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: sequence++,
    });
    await purposes.reduce(async (previous, purpose) => {
      await previous;
      const bytes = new Uint8Array([1, 2, 3]);
      const storageKey = `items/${itemId}/${purpose}.jpg`;
      bodies.set(storageKey, bytes);
      await insertRendition(database, {
        itemId,
        purpose,
        byte_size: bytes.length,
        storage_key: storageKey,
      });
    }, Promise.resolve());
    await database
      .insertInto("photo_fingerprint_backfill")
      .values({
        item_id: itemId,
        attempts: 0,
        next_attempt_at: NOW,
        last_error: null,
      })
      .execute();
    return itemId;
  };
  const options = {
    database: watched.database,
    b2,
    clock: () => {
      return currentTime;
    },
    fetch: fetchImage,
    makeFingerprint: async (_bytes: Uint8Array) => {
      return FINGERPRINT;
    },
  };
  return {
    database,
    bodies,
    requestedKeys,
    seed,
    options,
    callsInsideTransactions: watched.callsInsideTransactions,
    makeJob: () => {
      return createVisualFingerprintBackfillJob(options);
    },
    setTime: (instant: string) => {
      currentTime = new Date(instant);
    },
    readQueue: () => {
      return database
        .selectFrom("photo_fingerprint_backfill")
        .selectAll()
        .orderBy("item_id")
        .execute();
    },
    readItem: (id: string) => {
      return database
        .selectFrom("items")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },
  };
}
