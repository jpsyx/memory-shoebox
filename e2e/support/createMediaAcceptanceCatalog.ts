import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createB2Client } from "../../apps/server/src/b2/createB2Client/createB2Client.ts";
import { createTestApp } from "../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../apps/server/test/helpers/createTestConfig.ts";
import {
  insertItem,
  insertUploadSession,
} from "../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  insertBurst,
  insertRendition,
  setBurstCover,
} from "../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import { seedAcceptanceMembers } from "../admin/support/seedAcceptanceMembers.ts";
import { createFakeS3Server } from "./createFakeS3Server/createFakeS3Server.ts";
import type {
  FakeS3Transfer,
  StoredObject,
} from "./createFakeS3Server/createFakeS3Server.types.ts";
import { makeEtagFromBytes } from "./createFakeS3Server/fakeS3ProtocolHelpers.ts";

/** One isolated catalog, app origin, bucket and sanitized transfer ledger. */
export type MediaAcceptanceCatalog = {
  origin: string;
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  memberId: string;
  itemIds: readonly string[];
  getTransfers: () => readonly FakeS3Transfer[];
  close: () => Promise<void>;
};

type MediaFixture = {
  body: Buffer;
  contentType: string;
  width: number;
  height: number;
};
type SeedMediaOptions = {
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  memberId: string;
  itemIds: readonly string[];
  objects: Map<string, StoredObject>;
  fixtures: ReadonlyMap<string, MediaFixture>;
  bursts: readonly string[];
};

async function _getMediaFixtures(): Promise<Map<string, MediaFixture>> {
  const sources = [
    ["small", "burst_001-thumb.jpg", "image/jpeg", 400, 267],
    ["large", "burst_001.jpg", "image/jpeg", 1600, 1067],
    ["thumb", "the-walk-thumb.jpg", "image/jpeg", 400, 267],
    ["poster", "the-walk-poster.jpg", "image/jpeg", 960, 640],
    ["video_mp4", "the-walk.mp4", "video/mp4", 960, 640],
    ["video_webm", "the-walk.webm", "video/webm", 960, 640],
  ] as const;
  const fixtures = await Promise.all(
    sources.map(async ([name, filename, contentType, width, height]) => {
      const body = await readFile(
        fileURLToPath(
          new URL(`../fixtures/cartoon-media/web/${filename}`, import.meta.url),
        ),
      );
      return [name, { body, contentType, width, height }] as const;
    }),
  );
  return new Map(fixtures);
}

function _getDayFromPosition(position: number): string {
  const daysAgo = position < 1000 ? 0 : 1 + Math.floor((position - 1000) / 40);
  return new Date(Date.UTC(2026, 9, 13 - daysAgo)).toISOString().slice(0, 10);
}

async function _seedRenditions(
  options: Readonly<SeedMediaOptions> & { itemId: string; position: number },
): Promise<void> {
  const purposes =
    options.position === 31
      ? ["thumb", "poster", "video_mp4", "video_webm", "original"]
      : ["thumb", "display", "original"];
  await Promise.all(
    purposes.map(async (purpose) => {
      const fixtureName =
        options.position === 31
          ? purpose === "original"
            ? "video_mp4"
            : purpose
          : purpose === "thumb" || options.position % 2 === 0
            ? "small"
            : "large";
      const fixture = options.fixtures.get(fixtureName);
      if (fixture === undefined) {
        throw new Error(`Missing local fixture ${fixtureName}`);
      }
      const key = `media/${options.itemId}/${purpose}`;
      options.objects.set(`test/${key}`, {
        body: fixture.body,
        contentType: fixture.contentType,
        etag: makeEtagFromBytes(fixture.body),
        lastModified: "Tue, 13 Oct 2026 12:00:00 GMT",
      });
      await insertRendition(options.database, {
        itemId: options.itemId,
        purpose,
        storage_key: key,
        content_type: fixture.contentType,
        byte_size: fixture.body.length,
        width: fixture.width,
        height: fixture.height,
      });
    }),
  );
}

async function _seedItem(
  options: Readonly<SeedMediaOptions> & { itemId: string; position: number },
): Promise<void> {
  const { itemId, position, database, memberId, bursts } = options;
  const day = _getDayFromPosition(position);
  const burstPosition =
    position >= 3 && position <= 7
      ? 0
      : position >= 18 && position <= 22
        ? 1
        : undefined;
  const capturedAt = new Date(
    Date.parse(`${day}T12:00:00Z`) + (position % 1000) * 1000,
  ).toISOString();
  await insertItem(database, {
    uploadedBy: memberId,
    id: itemId,
    captured_on: day,
    captured_at: capturedAt,
    seq: 5000 - position,
    alt_text: `Measurement memory ${position + 1}`,
    kind: position === 31 ? "video" : "photo",
    content_type: position === 31 ? "video/mp4" : "image/jpeg",
    duration_ms: position === 31 ? 10000 : null,
    width: position === 31 ? 960 : position % 2 === 0 ? 400 : 1600,
    height: position === 31 ? 640 : position % 2 === 0 ? 267 : 1067,
    burst_id: burstPosition === undefined ? null : bursts[burstPosition],
    burst_index:
      burstPosition === undefined
        ? null
        : position - (burstPosition === 0 ? 3 : 18),
  });
  await _seedRenditions(options);
}

async function _seedArchive(
  options: Omit<SeedMediaOptions, "bursts">,
): Promise<void> {
  const session = await insertUploadSession(options.database, {
    uploadedBy: options.memberId,
    state: "settled",
  });
  const bursts = await Promise.all(
    [0, 1].map(() => {
      return insertBurst(options.database, {
        uploadSessionId: session,
        capturedOn: "2026-10-13",
      });
    }),
  );
  await options.itemIds.reduce(async (prior, itemId, position) => {
    await prior;
    await _seedItem({ ...options, bursts, itemId, position });
  }, Promise.resolve());
  await Promise.all(
    bursts.map((burstId, position) => {
      return setBurstCover(options.database, {
        burstId,
        coverItemId: options.itemIds[position === 0 ? 3 : 18]!,
      });
    }),
  );
}

type MediaContext = Awaited<ReturnType<typeof createTestApp>>;

function _createMediaContext(): Promise<MediaContext> {
  return createTestApp({
    config: createTestConfig({
      NODE_ENV: "development",
      ENABLE_FAKE_EMAIL: "true",
      B2_ENDPOINT: "http://127.0.0.1:1",
      B2_KEY_PREFIX: "test",
      WEB_DIST_PATH: fileURLToPath(
        new URL("../../apps/web/dist", import.meta.url),
      ),
    }),
    emailService: "none",
    mailDomainReader: "none",
    clock: () => {
      return new Date();
    },
  });
}

async function _seedMediaCatalog(context: Readonly<MediaContext>): Promise<{
  memberId: string;
  itemIds: string[];
  objects: Map<string, StoredObject>;
}> {
  const members = await seedAcceptanceMembers(context.database);
  await context.database
    .updateTable("sessions")
    .set({ expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    .execute();
  const itemIds = Array.from({ length: 5000 }, (_, position) => {
    return `10000000-0000-4000-8000-${String(position).padStart(12, "0")}`;
  });
  const objects = new Map<string, StoredObject>();
  await _seedArchive({
    database: context.database,
    memberId: members.admin.memberId,
    itemIds,
    objects,
    fixtures: await _getMediaFixtures(),
  });
  context.app.get("/api/media-evidence/session", async (_request, reply) => {
    return reply
      .header(
        "set-cookie",
        `shoebox_session=${members.admin.token}; Path=/; HttpOnly; SameSite=Lax`,
      )
      .redirect("/");
  });
  return { memberId: members.admin.memberId, itemIds, objects };
}

async function _startBucket(
  bucket: ReturnType<typeof createFakeS3Server>,
): Promise<void> {
  await new Promise<void>((fulfill, reject) => {
    bucket.once("error", reject);
    bucket.listen(0, "127.0.0.1", () => {
      bucket.off("error", reject);
      fulfill();
    });
  });
}

function _makeMediaBucket(options: {
  context: Readonly<MediaContext>;
  origin: string;
  objects: ReadonlyMap<string, StoredObject>;
  transfers: FakeS3Transfer[];
}): ReturnType<typeof createFakeS3Server> {
  return createFakeS3Server({
    bucketName: options.context.config.b2.bucket,
    allowedOrigins: [options.origin],
    objects: options.objects,
    enforceSignatureExpiry: true,
    latencyMs: 25,
    bytesPerSecond: 1024 * 1024,
    onTransfer: (transfer) => {
      options.transfers.push(transfer);
    },
  });
}

/** Own 5,000 memories, a 1,000-item day, two bursts and direct signed media. */
export async function createMediaAcceptanceCatalog(): Promise<MediaAcceptanceCatalog> {
  const context = await _createMediaContext();
  let bucket: ReturnType<typeof createFakeS3Server> | undefined;
  try {
    const { memberId, itemIds, objects } = await _seedMediaCatalog(context);
    const origin = await context.app.listen({ port: 0, host: "127.0.0.1" });
    const transfers: FakeS3Transfer[] = [];
    bucket = _makeMediaBucket({ context, origin, objects, transfers });
    await _startBucket(bucket);
    const mediaClient = createB2Client({
      ...context.config.b2,
      endpoint: `http://127.0.0.1:${(bucket.address() as AddressInfo).port}`,
    });
    context.b2.presignGet = mediaClient.presignGet;
    context.b2.getMediaLease = mediaClient.getMediaLease;
    const ownedBucket = bucket;
    return {
      origin,
      database: context.database,
      memberId,
      itemIds,
      getTransfers: () => {
        return transfers.map((transfer) => {
          return { ...transfer };
        });
      },
      close: async () => {
        try {
          await context.close();
        } finally {
          await _closeBucket(ownedBucket);
        }
      },
    };
  } catch (failure) {
    await context.close();
    if (bucket?.listening) {
      await _closeBucket(bucket);
    }
    throw failure;
  }
}

async function _closeBucket(
  bucket: ReturnType<typeof createFakeS3Server>,
): Promise<void> {
  bucket.closeAllConnections();
  await new Promise<void>((fulfill, reject) => {
    bucket.close((failure) => {
      if (failure !== undefined) {
        reject(failure);
      } else {
        fulfill();
      }
    });
  });
}
