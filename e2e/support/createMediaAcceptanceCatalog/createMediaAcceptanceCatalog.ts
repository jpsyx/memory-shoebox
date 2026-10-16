import {
  getMediaFixturesFromDisk,
  seedMediaAcceptanceArchive,
} from "./mediaAcceptanceSeedHelpers.ts";
import { setOwnedOriginalPhoto } from "../setOwnedOriginalPhoto.ts";
import type { AddressInfo } from "node:net";
import { fileURLToPath as fileUrlToPath } from "node:url";
import { createB2Client } from "../../../apps/server/src/b2/createB2Client/createB2Client.ts";
import { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../../apps/server/test/helpers/createTestConfig.ts";
import { seedAcceptanceMembers } from "../../admin/support/seedAcceptanceMembers.ts";
import { createFakeS3Server } from "../createFakeS3Server/createFakeS3Server.ts";
import type {
  FakeS3LedgerSnapshot,
  FakeS3Transfer,
  StoredObject,
} from "../createFakeS3Server/createFakeS3Server.types.ts";
import { getSpeculativeImageHarness } from "../getSpeculativeImageHarness.ts";
type MediaBucketOptions = {
  context: Readonly<MediaContext>;
  origin: string;
  objects: ReadonlyMap<string, StoredObject>;
  transfers: FakeS3Transfer[];
  clock: () => Date;
};

/** One isolated catalog, app origin, bucket and sanitized transfer ledger. */
export type MediaAcceptanceCatalog = {
  origin: string;
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  memberId: string;
  itemIds: readonly string[];
  getTransfers: () => FakeS3Transfer[];
  /**
   * Includes starts, pending responses and queued body events, without URLs.
   */
  getLedger: () => FakeS3LedgerSnapshot;
  /** Exact fixture ownership, including thumbnails, variants and originals. */
  getObjectIdsForItem: (itemId: string) => string[];
  /**
   * Advances only this isolated catalog and bucket clock for lease acceptance.
   */
  advanceClock: (milliseconds: number) => void;
  /**
   * Replaces one owned fixture before navigation with an original-only photo.
   */
  setOriginalPhotoFromBytes: (
    options: Pick<
      Parameters<typeof setOwnedOriginalPhoto>[0],
      "itemId" | "body" | "width" | "height"
    >,
  ) => Promise<void>;
  close: () => Promise<void>;
};

type MediaContext = Awaited<ReturnType<typeof createTestApp>>;

function _createMediaContext(clock: () => Date): Promise<MediaContext> {
  return createTestApp({
    config: createTestConfig({
      NODE_ENV: "development",
      ENABLE_FAKE_EMAIL: "true",
      B2_ENDPOINT: "http://127.0.0.1:1",
      B2_KEY_PREFIX: "test",
      WEB_DIST_PATH: fileUrlToPath(
        new URL("../../../apps/web/dist", import.meta.url),
      ),
    }),
    emailService: "none",
    mailDomainReader: "none",
    clock,
  });
}

async function _seedMediaCatalog({
  context,
  responsivePhotos,
  itemCount,
}: {
  context: Readonly<MediaContext>;
  responsivePhotos: boolean;
  itemCount: number;
}): Promise<{
  memberId: string;
  itemIds: string[];
  objects: Map<string, StoredObject>;
}> {
  const members = await seedAcceptanceMembers(context.database);
  await context.database
    .updateTable("sessions")
    .set({ expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    .execute();
  const itemIds = Array.from({ length: itemCount }, (_, position) => {
    return `10000000-0000-4000-8000-${String(position).padStart(12, "0")}`;
  });
  const objects = new Map<string, StoredObject>();
  await seedMediaAcceptanceArchive({
    database: context.database,
    memberId: members.admin.memberId,
    itemIds,
    objects,
    fixtures: await getMediaFixturesFromDisk(),
    responsivePhotos,
  });
  context.app.get(
    "/api/media-evidence/image-loader.js",
    async (_request, reply) => {
      return reply
        .type("text/javascript")
        .send(await getSpeculativeImageHarness());
    },
  );
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

function _makeMediaBucket(
  options: MediaBucketOptions,
): ReturnType<typeof createFakeS3Server> {
  return createFakeS3Server({
    bucketName: options.context.config.b2.bucket,
    allowedOrigins: [options.origin],
    objects: options.objects,
    enforceSignatureExpiry: true,
    clock: options.clock,
    latencyMs: 25,
    bytesPerSecond: 1024 * 1024,
    onTransfer: (transfer) => {
      options.transfers.push(transfer);
    },
  });
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

/** Own 5,000 memories, a 1,000-item day, two bursts and direct signed media. */
export async function createMediaAcceptanceCatalog(
  options: Readonly<{ responsivePhotos?: boolean; itemCount?: number }> = {},
): Promise<MediaAcceptanceCatalog> {
  let clockOffset = 0;
  const clock = () => {
    return new Date(Date.now() + clockOffset);
  };
  const context = await _createMediaContext(clock);
  let bucket: ReturnType<typeof createFakeS3Server> | undefined;
  try {
    const { memberId, itemIds, objects } = await _seedMediaCatalog({
      context,
      responsivePhotos: options.responsivePhotos ?? false,
      itemCount: options.itemCount ?? 5000,
    });
    const origin = await context.app.listen({ port: 0, host: "127.0.0.1" });
    const transfers: FakeS3Transfer[] = [];
    bucket = _makeMediaBucket({ context, origin, objects, transfers, clock });
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
      advanceClock: (milliseconds) => {
        clockOffset += milliseconds;
      },
      database: context.database,
      memberId,
      itemIds,
      getTransfers: () => {
        return transfers.map((transfer) => {
          return { ...transfer };
        });
      },
      getLedger: ownedBucket.getLedger,
      getObjectIdsForItem: (itemId) => {
        return [...objects.keys()].filter((key) => {
          return key.split("/").includes(itemId);
        });
      },
      setOriginalPhotoFromBytes: async (input) => {
        await setOwnedOriginalPhoto({
          ...input,
          database: context.database,
          writeOwnedObject: mediaClient.putObject,
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
