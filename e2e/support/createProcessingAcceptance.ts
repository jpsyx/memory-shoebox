import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../../apps/server/src/createApp.ts";
import { createDatabase } from "../../apps/server/src/db/client.ts";
import { migrateToLatest } from "../../apps/server/src/db/migrate.ts";
import { createB2Client } from "../../apps/server/src/b2/createB2Client/createB2Client.ts";
import { createMediaProcessingJob } from "../../apps/server/src/mediaProcessing/createMediaProcessingJob.ts";
import { createMediaDecodeCoordinator } from "../../apps/server/src/mediaProcessing/createMediaDecodeCoordinator.ts";
import { processMediaSource } from "../../apps/server/src/mediaProcessing/processMediaSource.ts";
import {
  createVerificationRunner,
  getFixturePath,
} from "../../apps/server/test/mediaProcessing/recipeTestHelpers.ts";
import { createTestConfig } from "../../apps/server/test/helpers/createTestConfig.ts";
import { insertSignedInMember } from "../../apps/server/test/helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
  insertUploadFile,
  insertUploadSession,
} from "../../apps/server/test/helpers/seedHelpers/seedHelpers.ts";
import { createFakeS3Server } from "./createFakeS3Server/createFakeS3Server.ts";
import type { MediaProcessingRuntime } from "../../apps/server/src/mediaProcessing/mediaProcessing.types.ts";

/** Local real-S3-client acceptance, with a clearly codec-only test adapter. */
export function createProcessingAcceptance(
  directory: string,
): ReturnType<typeof _makeAcceptance> {
  return _makeAcceptance(directory);
}

async function _startAcceptance(directory: string) {
  await mkdir(directory, { recursive: true });
  const bucket = createFakeS3Server({
    bucketName: "memory-shoebox-media",
    allowedOrigins: [],
  });
  bucket.listen(0, "127.0.0.1");
  await once(bucket, "listening");
  const endpoint = `http://127.0.0.1:${(bucket.address() as AddressInfo).port}`;
  const config = createTestConfig({
    NODE_ENV: "development",
    ENABLE_FAKE_EMAIL: "true",
    B2_ENDPOINT: endpoint,
    MEDIA_PROCESSING_ENABLED: "false",
  });
  const b2 = createB2Client(config.b2);
  const databasePath = join(directory, "catalog.db");
  const database = createDatabase(databasePath);
  await migrateToLatest(database);
  const member = await insertSignedInMember({
    database,
    member: { role: "admin" },
    session: { expires_at: new Date(Date.now() + 86_400_000).toISOString() },
  });
  const app = await createApp({
    database,
    b2,
    config,
    logger: false,
    emailService: "none",
    mailDomainReader: "none",
  });
  const origin = await app.listen({ port: 0, host: "127.0.0.1" });
  return { app, origin, b2, member, database, databasePath, bucket, endpoint };
}

async function _makeAcceptance(directory: string) {
  const context = await _startAcceptance(directory);
  const { app, origin, b2, member, databasePath, bucket, endpoint } = context;
  let { database } = context;
  const runtime = _makeRuntime();
  return {
    app,
    origin,
    b2,
    member,
    runtime,
    get database() {
      return database;
    },
    upload: () => {
      return _prepareUpload({ database, b2, memberId: member.memberId });
    },
    repair: () => {
      return _prepareRepair({ database, b2, memberId: member.memberId });
    },
    run: () => {
      return _runJob({ database, b2, runtime });
    },
    reopen: async () => {
      await app.close();
      await database.destroy();
      database = createDatabase(databasePath);
    },
    requests: async () => {
      return (await (
        await fetch(`${endpoint}/__fake-s3/requests`)
      ).json()) as unknown;
    },
    close: async () => {
      await app.close();
      await database.destroy();
      bucket.closeAllConnections();
      await new Promise<void>((done) => {
        return bucket.close(() => {
          return done();
        });
      });
    },
  };
}

async function _prepareUpload(options: {
  database: ReturnType<typeof createDatabase>;
  b2: ReturnType<typeof createB2Client>;
  memberId: string;
}) {
  const bytes = await readFile(getFixturePath("oriented.jpg"));
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const now = new Date().toISOString();
  const sessionId = await insertUploadSession(options.database, {
    uploadedBy: options.memberId,
    total_bytes: bytes.length,
  });
  const fileId = await insertUploadFile(options.database, {
    uploadSessionId: sessionId,
    state: "sending",
    declared_bytes: bytes.length,
    content_hash: contentHash,
    storage_key: "new-upload/original.jpg",
    captured_at: now,
    capture_date: now.slice(0, 10),
    capture_source: "uploader_set",
    original_captured_at: now,
    width: 1600,
    height: 2400,
  });
  await options.b2.putObject({
    key: "new-upload/original.jpg",
    body: bytes,
    contentType: "image/jpeg",
  });
  return { sessionId, fileId, bytes, contentHash };
}

async function _prepareRepair(options: {
  database: ReturnType<typeof createDatabase>;
  b2: ReturnType<typeof createB2Client>;
  memberId: string;
}) {
  const bytes = await readFile(getFixturePath("oriented.jpg"));
  const itemId = await insertItem(options.database, {
    uploadedBy: options.memberId,
    seq: 999,
    content_type: "image/jpeg",
    byte_size: bytes.length,
  });
  await insertRendition(options.database, {
    itemId,
    purpose: "original",
    storage_key: "existing/original.jpg",
    byte_size: bytes.length,
  });
  await options.b2.putObject({
    key: "existing/original.jpg",
    body: bytes,
    contentType: "image/jpeg",
  });
  return { itemId, bytes };
}

function _makeRuntime(): MediaProcessingRuntime {
  return {
    getCapabilities: async () => {
      return { available: true, reason: null };
    },
    processSource: async (options) => {
      return processMediaSource({
        ...options,
        runner: await createVerificationRunner(),
      });
    },
    makeFingerprint: async () => {
      return undefined;
    },
  };
}

function _runJob(options: {
  database: ReturnType<typeof createDatabase>;
  b2: ReturnType<typeof createB2Client>;
  runtime: MediaProcessingRuntime;
}): Promise<void> {
  const { database, b2, runtime } = options;
  return createMediaProcessingJob({
    database,
    b2,
    clock: () => {
      return new Date();
    },
    signal: new AbortController().signal,
    coordinator: createMediaDecodeCoordinator(),
    runtime,
    logger: { info: () => {}, error: () => {} },
  }).run();
}
