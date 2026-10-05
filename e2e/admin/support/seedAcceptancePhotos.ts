import { insertItem } from "../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  insertRendition,
  insertItemView,
} from "../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";

import type { AcceptanceContext } from "./acceptanceTypes.ts";
/** Seed photos with actual retained rendition names and a prior opening. */
export async function seedAcceptancePhotos(
  database: AcceptanceContext["database"],
  adminId: string,
  rosa: string,
  only: string,
  except: string,
  mediaByKey: Map<string, string>,
): Promise<void> {
  const now = new Date().toISOString();
  const media = ["highChair", "bath", "the-walk-poster"];
  await Promise.all(
    media.map(async (filename, position) => {
      const itemId = await insertItem(database, {
        uploadedBy: adminId,
        id: `00000000-0000-4000-8000-${String(position + 10).padStart(12, "0")}`,
        captured_at: `2026-09-27T0${position}:30:00.000Z`,
        captured_on: "2026-09-27",
        seq: position + 1,
        alt_text: "A family memory",
        width: 800,
        height: 600,
        ...(position === 0
          ? { visibility_rule_id: only }
          : position === 1
            ? { visibility_rule_id: except }
            : {}),
      });
      await _seedPhotoRenditions(
        database,
        itemId,
        position,
        filename,
        mediaByKey,
      );
      if (position === 2) {
        await insertItemView(database, {
          memberId: rosa,
          itemId,
          first_opened_at: now,
          last_opened_at: now,
          open_count: 2,
        });
      }
    }),
  );
}

async function _seedPhotoRenditions(
  database: AcceptanceContext["database"],
  itemId: string,
  position: number,
  filename: string,
  mediaByKey: Map<string, string>,
): Promise<void> {
  await Promise.all(
    ["thumb", "display", "original"].map(async (purpose) => {
      const key = `evidence/${position}/${purpose}.jpg`;
      mediaByKey.set(key, `${filename}.jpg`);
      await insertRendition(database, { itemId, purpose, storage_key: key });
    }),
  );
}
