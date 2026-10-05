import { insertItem } from "../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";

import {
  insertRendition,
  insertItemView,
} from "../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";

import type { AcceptanceContext } from "./acceptance.types.ts";

type SeedAcceptancePhotosOptions = {
  database: AcceptanceContext["database"];
  adminId: string;
  rosa: string;
  only: string;
  except: string;
  mediaByKey: Map<string, string>;
};

type PriorPhotoOpening = {
  database: AcceptanceContext["database"];
  memberId: string;
  itemId: string;
  openedAt: string;
  position: number;
};

type SeedPhotoRenditionsOptions = {
  database: AcceptanceContext["database"];
  itemId: string;
  position: number;
  filename: string;
  mediaByKey: Map<string, string>;
};

async function _seedPhotoRenditions({
  database,
  itemId,
  position,
  filename,
  mediaByKey,
}: Readonly<SeedPhotoRenditionsOptions>): Promise<void> {
  await Promise.all(
    ["thumb", "display", "original"].map(async (purpose) => {
      const key = `evidence/${position}/${purpose}.jpg`;
      mediaByKey.set(key, `${filename}.jpg`);
      await insertRendition(database, { itemId, purpose, storage_key: key });
    }),
  );
}

async function _seedPriorPhotoOpening({
  database,
  memberId,
  itemId,
  openedAt,
  position,
}: Readonly<PriorPhotoOpening>): Promise<void> {
  if (position === 2) {
    await insertItemView(database, {
      memberId,
      itemId,
      first_opened_at: openedAt,
      last_opened_at: openedAt,
      open_count: 2,
    });
  }
}

/** Seed photos with actual retained rendition names and a prior opening. */
export async function seedAcceptancePhotos({
  database,
  adminId,
  rosa,
  only,
  except,
  mediaByKey,
}: Readonly<SeedAcceptancePhotosOptions>): Promise<void> {
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
      await _seedPhotoRenditions({
        database,
        itemId,
        position,
        filename,
        mediaByKey,
      });
      await _seedPriorPhotoOpening({
        database,
        memberId: rosa,
        itemId,
        openedAt: now,
        position,
      });
    }),
  );
}
