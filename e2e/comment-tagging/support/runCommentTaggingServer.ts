import { fileURLToPath as fileUrlToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { createB2Client } from "../../../apps/server/src/b2/createB2Client/createB2Client.ts";
import { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../../apps/server/test/helpers/createTestConfig.ts";
import { createRecordingEmailService } from "../../../apps/server/test/helpers/createRecordingEmailService.ts";
import { insertSignedInMember } from "../../../apps/server/test/helpers/insertSignedInMember.ts";
import {
  insertItemPerson,
  insertPerson,
} from "../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import { insertComment } from "../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  insertInstanceSetting,
  insertVisibilityRule,
} from "../../../apps/server/test/helpers/seedHelpers/seedHelpers.ts";
import { createFakeS3Server } from "../../support/createFakeS3Server/createFakeS3Server.ts";
import type { StoredObject } from "../../support/createFakeS3Server/createFakeS3Server.types.ts";
import { E2E_SERVER_ENVIRONMENT } from "../../support/e2eEnvironment.constants.ts";
import {
  getMediaFixturesFromDisk,
  seedMediaAcceptanceArchive,
} from "../../support/createMediaAcceptanceCatalog/mediaAcceptanceSeedHelpers.ts";
import { runMailQueueOnce } from "../../../apps/server/src/mail/runMailQueueOnce.ts";

type Context = Awaited<ReturnType<typeof createTestApp>>;

/** Exactly 80 characters, including the final distinguishing surname. */
export const LONG_PERSON_NAME = `Alexandria ${"Montgomery ".repeat(6)}Lee`;

/** The fixture lifetime is owned by the Playwright test process. */
export type CommentTaggingCatalog = Context &
  Awaited<ReturnType<typeof _seedArchive>> & {
    members: Awaited<ReturnType<typeof _seedMembers>>;
    origin: string;
    endpoint: string;
    sender: ReturnType<typeof createRecordingEmailService>;
    objects: Map<string, StoredObject>;
    drainMail: () => ReturnType<typeof runMailQueueOnce>;
  };

async function _seedMembers(database: Context["database"]) {
  const names = [
    "Ana",
    "Jorge",
    "Uploader",
    "John",
    "Incomplete",
    "Former",
  ] as const;
  const members = await Promise.all(
    names.map(async (name) => {
      const member = await insertSignedInMember({
        database,
        token: `comment-tagging-${name}`,
        member: {
          display_name: name === "Incomplete" ? null : name,
          suggested_display_name: name === "Incomplete" ? "John" : null,
          profile_completed_at:
            name === "Incomplete" ? null : new Date().toISOString(),
          email: `${name.toLowerCase()}@example.test`,
          role: "uploader",
          status: name === "Former" ? "removed" : "active",
        },
        session: {
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
      const personId = await insertPerson(database, {
        displayName: name,
        member_id: member.memberId,
      });
      return [name, { ...member, personId }] as const;
    }),
  );
  return Object.fromEntries(members) as Record<
    (typeof names)[number],
    (typeof members)[number][1]
  >;
}

async function _seedArchive(
  context: Context,
  members: Awaited<ReturnType<typeof _seedMembers>>,
  objects: Map<string, StoredObject>,
) {
  const itemIds = Array.from({ length: 125 }, (_, position) => {
    return `10000000-0000-4000-8000-${String(position).padStart(12, "0")}`;
  });
  await seedMediaAcceptanceArchive({
    database: context.database,
    memberId: members.Uploader.memberId,
    itemIds,
    objects,
    fixtures: await getMediaFixturesFromDisk(),
    responsivePhotos: false,
  });
  await _seedCollectionAccess(context, members, itemIds);
  return _seedConversation(context, members, itemIds);
}

async function _seedCollectionAccess(
  context: Context,
  members: Awaited<ReturnType<typeof _seedMembers>>,
  itemIds: string[],
) {
  await context.database
    .updateTable("items")
    .set({ uploaded_by: members.Jorge.memberId })
    .where("id", "in", itemIds.slice(1, 91))
    .execute();
  await Promise.all(
    [
      0,
      2,
      31,
      ...Array.from({ length: 34 }, (_, index) => {
        return index + 91;
      }),
    ].map((position) => {
      return insertItemPerson(context.database, {
        itemId: itemIds[position]!,
        personId: members.Jorge.personId,
      });
    }),
  );
  const hiddenRule = await insertVisibilityRule(context.database, {
    mode: "only",
  });
  await context.database
    .updateTable("items")
    .set({
      visibility_rule_id: hiddenRule,
      alt_text: "Hidden distinctive memory 7391",
    })
    .where("id", "in", itemIds.slice(91))
    .execute();
}

async function _seedConversation(
  context: Context,
  members: Awaited<ReturnType<typeof _seedMembers>>,
  itemIds: string[],
) {
  const adHocId = await insertPerson(context.database, {
    displayName: "Jorge",
  });
  const longPersonId = await insertPerson(context.database, {
    displayName: LONG_PERSON_NAME,
  });
  await insertItemPerson(context.database, {
    itemId: itemIds[0]!,
    personId: adHocId,
  });
  await insertItemPerson(context.database, {
    itemId: itemIds[0]!,
    personId: longPersonId,
  });
  const commentId = await insertComment(context.database, {
    itemId: itemIds[0]!,
    authorMemberId: members.Jorge.memberId,
    body: "A remembered afternoon.",
  });
  const momentId = await insertComment(context.database, {
    itemId: itemIds[31]!,
    authorMemberId: members.Jorge.memberId,
    body: "The moment at three seconds.",
    at_seconds: 3,
  });
  return {
    itemIds,
    itemId: itemIds[0]!,
    videoId: itemIds[31]!,
    hiddenId: itemIds[91]!,
    commentId,
    momentId,
    adHocId,
    longPersonId,
  };
}

function _getSafeConfig(endpoint: string) {
  const webPath = fileUrlToPath(
    new URL("../../../apps/web/dist/", import.meta.url),
  );
  const config = createTestConfig({
    ...E2E_SERVER_ENVIRONMENT,
    DATABASE_PATH: ":memory:",
    B2_ENDPOINT: endpoint,
    WEB_DIST_PATH: webPath,
  });
  if (
    config.nodeEnv !== "development" ||
    !config.enableFakeEmail ||
    config.databasePath !== ":memory:" ||
    new URL(endpoint).hostname !== "127.0.0.1" ||
    config.webDistPath !== webPath ||
    config.resendApiKey ||
    config.upstashRedisRestUrl ||
    config.upstashRedisRestToken
  ) {
    throw new Error("Refusing unsafe comment-tagging acceptance configuration");
  }
  return config;
}

async function _startBucket(
  objects: Map<string, StoredObject>,
  origin: string,
) {
  const origins = [origin];
  const bucket = createFakeS3Server({
    bucketName: E2E_SERVER_ENVIRONMENT.B2_BUCKET,
    allowedOrigins: origins,
    objects,
  });
  await new Promise<void>((fulfill, reject) => {
    bucket.once("error", reject);
    bucket.listen(0, "127.0.0.1", fulfill);
  });
  const endpoint = `http://127.0.0.1:${(bucket.address() as AddressInfo).port}`;
  return { bucket, origins, endpoint };
}

async function _startCatalog(
  context: Context,
  sender: ReturnType<typeof createRecordingEmailService>,
  onBucket: (
    bucket: Awaited<ReturnType<typeof _startBucket>>["bucket"],
  ) => void,
  close: () => Promise<void>,
): Promise<CommentTaggingCatalog> {
  const objects = new Map<string, StoredObject>();
  const members = await _seedMembers(context.database);
  const archive = await _seedArchive(context, members, objects);
  const origin = await context.app.listen({ port: 0, host: "127.0.0.1" });
  const storage = await _startBucket(objects, origin);
  onBucket(storage.bucket);
  context.config.b2.endpoint = storage.endpoint;
  Object.assign(context.b2, createB2Client(context.config.b2));
  await Promise.all(
    Object.entries({
      "public.base_url": origin,
      "mail.from_address": "recording@example.test",
      "shoebox.name": "Comment tagging acceptance",
    }).map(([key, value]) => {
      return insertInstanceSetting(context.database, { key, value });
    }),
  );
  const database = context.database;
  return {
    ...context,
    ...archive,
    members,
    origin,
    endpoint: storage.endpoint,
    sender,
    objects,
    close,
    drainMail: () => {
      return runMailQueueOnce({
        database,
        sender,
        now: new Date().toISOString(),
      });
    },
  };
}

/**
 * Real HTTP app, private disposable catalog and local S3, with recorded
 * mail.
 */
export async function runCommentTaggingServer(): Promise<CommentTaggingCatalog> {
  process.env.NODE_ENV = "development";
  process.env.ENABLE_FAKE_EMAIL = "true";
  const config = _getSafeConfig("http://127.0.0.1:1");
  const sender = createRecordingEmailService();
  const context = await createTestApp({
    config,
    emailService: sender,
    mailDomainReader: "none",
    clock: () => {
      return new Date();
    },
  });
  let bucket: Awaited<ReturnType<typeof _startBucket>>["bucket"] | undefined;
  const close = async () => {
    try {
      await context.close();
    } finally {
      if (bucket) {
        bucket.closeAllConnections();
        await new Promise<void>((fulfill) => {
          return bucket!.close(() => {
            fulfill();
          });
        });
      }
    }
  };
  try {
    return await _startCatalog(
      context,
      sender,
      (started) => {
        bucket = started;
      },
      close,
    );
  } catch (failure) {
    await close();
    throw failure;
  }
}
