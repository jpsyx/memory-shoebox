import { insertItem } from "../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  insertRendition,
  insertItemPerson,
} from "../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";

import type { AcceptanceContext } from "./acceptanceTypes.ts";
/** Seed the retained ten-second video and its viewer tag. */
export async function seedAcceptanceVideo(
  database: AcceptanceContext["database"],
  adminId: string,
  person: string,
  mediaByKey: Map<string, string>,
): Promise<string> {
  const videoId = await insertItem(database, {
    uploadedBy: adminId,
    id: "00000000-0000-4000-8000-000000000013",
    seq: 4,
    kind: "video",
    content_type: "video/mp4",
    duration_ms: 10000,
    captured_at: "2026-09-27T03:30:00.000Z",
    captured_on: "2026-09-27",
    width: 960,
    height: 540,
    alt_text: "A family walk",
  });
  await insertItemPerson(database, { itemId: videoId, personId: person });

  await _seedVideoRenditions(database, videoId, mediaByKey);
  return videoId;
}
async function _seedVideoRenditions(
  database: AcceptanceContext["database"],
  videoId: string,
  mediaByKey: Map<string, string>,
): Promise<void> {
  await Promise.all(
    ["thumb", "poster", "video_mp4", "video_webm"].map(async (purpose) => {
      const filename =
        purpose === "video_mp4"
          ? "the-walk.mp4"
          : purpose === "video_webm"
            ? "the-walk.webm"
            : purpose === "thumb"
              ? "the-walk-thumb.jpg"
              : "the-walk-poster.jpg";
      const key = `evidence/video/${purpose}`;
      mediaByKey.set(key, filename);
      await insertRendition(database, {
        itemId: videoId,
        purpose,
        storage_key: key,
        content_type: purpose.startsWith("video")
          ? `video/${purpose === "video_mp4" ? "mp4" : "webm"}`
          : "image/jpeg",
        width: 960,
        height: 540,
      });
    }),
  );
}
