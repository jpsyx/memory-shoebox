import { readFile } from "node:fs/promises";
import { fileURLToPath as fileUrlToPath } from "node:url";
import type { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import {
  insertBurst,
  insertRendition,
  setBurstCover,
} from "../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import {
  insertItem,
  insertUploadSession,
} from "../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import type { StoredObject } from "../createFakeS3Server/createFakeS3Server.types.ts";
import { makeEtagFromBytes } from "../createFakeS3Server/fakeS3ProtocolHelpers.ts";

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
  responsivePhotos: boolean;
};

/** Reads the deterministic image and video fixtures from the local fixture tree. */
export async function getMediaFixturesFromDisk(): Promise<
  Map<string, MediaFixture>
> {
  const sources = [
    ["portrait-thumb", "pram-thumb.jpg", "image/jpeg", 267, 400],
    ["portrait-display", "pram.jpg", "image/jpeg", 1067, 1600],
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
        fileUrlToPath(
          new URL(
            `../../fixtures/cartoon-media/web/${filename}`,
            import.meta.url,
          ),
        ),
      );
      return [name, { body, contentType, width, height }] as const;
    }),
  );
  return new Map(fixtures);
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
        options.responsivePhotos && options.position === 1015
          ? purpose === "thumb"
            ? "portrait-thumb"
            : "portrait-display"
          : options.position === 31
            ? purpose === "original"
              ? "video_mp4"
              : purpose
            : purpose === "thumb" ||
                (options.position % 2 === 0 &&
                  !(options.responsivePhotos && options.position === 32))
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
  const daysAgo = position < 1000 ? 0 : 1 + Math.floor((position - 1000) / 40);
  const day = new Date(Date.UTC(2026, 9, 13 - daysAgo))
    .toISOString()
    .slice(0, 10);
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
    width:
      options.responsivePhotos && position === 1015
        ? 1067
        : position === 31
          ? 960
          : position % 2 === 0 && !(options.responsivePhotos && position === 32)
            ? 400
            : 1600,
    height:
      options.responsivePhotos && position === 1015
        ? 1600
        : position === 31
          ? 640
          : position % 2 === 0 && !(options.responsivePhotos && position === 32)
            ? 267
            : 1067,
    burst_id: burstPosition === undefined ? null : bursts[burstPosition],
    burst_index:
      burstPosition === undefined
        ? null
        : position - (burstPosition === 0 ? 3 : 18),
  });
  await _seedRenditions(options);
}

/** Seeds each archive item and rendition before assigning its burst cover. */
export async function seedMediaAcceptanceArchive(
  options: Readonly<Omit<SeedMediaOptions, "bursts">>,
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
