import type { Selectable } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { ProcessingClaim } from "../../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";
import type { uploadProcessingOutput } from "../../../src/mediaProcessing/output/uploadProcessingOutput.ts";
import { once } from "node:events";

import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { tmpdir } from "node:os";

import { join } from "node:path";

import type { AddressInfo } from "node:net";

import { onTestFinished } from "vitest";

import { createFakeS3Server } from "../../../../../e2e/support/createFakeS3Server/createFakeS3Server.ts";

import { createB2Client } from "../../../src/b2/createB2Client/createB2Client.ts";

import { createTestConfig } from "../../helpers/createTestConfig.ts";

import { createDatabase } from "../../../src/db/client.ts";

import { migrateToLatest } from "../../../src/db/migrate.ts";

import { createMediaProcessingQueue } from "../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import {
  insertItem,
  insertMember,
  insertRendition,
} from "../../helpers/seedHelpers/seedHelpers.ts";
/** Shared scenario fixture. */
export const MIB = 1024 ** 2;
/** Shared scenario fixture. */
export async function createRecordingMultipartStorage(): Promise<{
  b2: ReturnType<typeof createB2Client>;
  requests: () => Promise<
    Array<{ operation: string; key: string; byteLength: number }>
  >;
}> {
  const server = createFakeS3Server({
    bucketName: "memory-shoebox-media",
    allowedOrigins: [],
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const b2 = createB2Client(createTestConfig({ B2_ENDPOINT: endpoint }).b2);
  return {
    b2,
    requests: async () => {
      const response = await fetch(`${endpoint}/__fake-s3/requests`);
      return (
        (await response.json()) as {
          requests: Array<{
            operation: string;
            key: string;
            byteLength: number;
          }>;
        }
      ).requests;
    },
  };
}
/** Shared scenario fixture. */
export async function* makeBodyFromSize(size: number): AsyncGenerator<Buffer> {
  yield Buffer.alloc(size, 3);
}
/** Shared scenario fixture. */
export async function createMultipartOutputFixture(): Promise<
  Awaited<ReturnType<typeof createRecordingMultipartStorage>> & {
    database: ReturnType<typeof createDatabase>;
    databasePath: string;
    queue: ReturnType<typeof createMediaProcessingQueue>;
    claim: ProcessingClaim;
    outputId: string;
    key: string;
    upload: Parameters<typeof uploadProcessingOutput>[0];
    row: () => Promise<Selectable<Database["media_processing_outputs"]>>;
  }
> {
  const directory = await mkdtemp(join(tmpdir(), "processing-output-"));
  const databasePath = join(directory, "catalog.db");
  const database = createDatabase(databasePath);
  onTestFinished(async () => {
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  });
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const sourceRenditionId = await insertRendition(database, {
    itemId,
    purpose: "original",
  });
  const queue = createMediaProcessingQueue({
    database,
    clock: () => {
      return new Date();
    },
  });
  await queue.enqueue({
    itemId,
    sourceRenditionId,
    recipe: "photo-v1",
    priority: 0,
  });
  const claim = (await queue.claim())!;
  const outputId = "output-1";
  const key = `processing/${claim.attemptToken}/display.jpg`;
  await database
    .insertInto("media_processing_outputs")
    .values({
      id: outputId,
      job_id: claim.jobId,
      item_id: itemId,
      attempt_token: claim.attemptToken,
      storage_key: key,
      purpose: "display",
      state: "reserved",
      multipart_upload_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .execute();
  const path = join(directory, "display.jpg");
  await writeFile(path, Buffer.alloc(1024));
  const storage = await createRecordingMultipartStorage();
  const upload = {
    database,
    b2: storage.b2,
    claim,
    outputId,
    path,
    contentType: "image/jpeg",
    byteSize: 1024,
    signal: new AbortController().signal,
  };
  const row = () => {
    return database
      .selectFrom("media_processing_outputs")
      .selectAll()
      .where("id", "=", outputId)
      .executeTakeFirstOrThrow();
  };
  return {
    ...storage,
    database,
    databasePath,
    queue,
    claim,
    outputId,
    key,
    upload,
    row,
  };
}
