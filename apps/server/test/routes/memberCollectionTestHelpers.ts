import type { TimelineResponse } from "@memory-shoebox/shared";
import { timelineResponseSchema } from "@memory-shoebox/shared";
import { expect } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { makeMemberCollectionFixture } from "../helpers/memberCollectionFixture.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";

type Fixture = Awaited<ReturnType<typeof makeMemberCollectionFixture>>;

/**
 * Shared get selection from member id for focused local regression
 * scenarios.
 */
export function getSelectionFromMemberId(member: string): {
  tags: string[];
  people: string[];
  member: string;
} {
  return { tags: [], people: [], member };
}

/** Shared read member timeline for focused local regression scenarios. */
export async function readMemberTimeline(
  fixture: Readonly<Fixture>,
  query = `member=${fixture.memberId}`,
): Promise<TimelineResponse> {
  const response = await fixture.get(`timeline?${query}`);
  expect(response.statusCode).toBe(200);
  return timelineResponseSchema.parse(response.json());
}

/** Shared get item ids from timeline for focused local regression scenarios. */
export function getItemIdsFromTimeline(
  body: Readonly<Awaited<ReturnType<typeof readMemberTimeline>>>,
): string[] {
  return body.days.flatMap((day) => {
    return day.items.map((item) => {
      return item.itemId;
    });
  });
}

/** Shared read seen ids for focused local regression scenarios. */
export async function readSeenIds(
  fixture: Readonly<Fixture>,
): Promise<string[]> {
  const rows = await fixture.database
    .selectFrom("item_views")
    .select("item_id")
    .where("member_id", "=", fixture.reader.memberId)
    .execute();
  return rows
    .map((row) => {
      return row.item_id;
    })
    .sort();
}

/** Shared read selected ids for focused local regression scenarios. */
export async function readSelectedIds(
  fixture: Readonly<Fixture>,
): Promise<string[]> {
  const responses = await Promise.all(
    fixture.itemIds.map(async (itemId) => {
      const response = await fixture.post("media/position", {
        itemId,
        selection: getSelectionFromMemberId(fixture.memberId),
      });
      expect(response.statusCode).toBe(200);
      return response.json() === null ? [] : [itemId];
    }),
  );
  return responses.flat();
}

/** Shared insert published avatar for focused local regression scenarios. */
export async function insertPublishedAvatar(
  fixture: Readonly<Fixture>,
): Promise<string> {
  const avatarId = createId();
  await fixture.database
    .insertInto("member_avatar_uploads")
    .values({
      id: avatarId,
      member_id: fixture.memberId,
      storage_key: `avatars/${fixture.memberId}/${avatarId}.webp`,
      expected_avatar_id: null,
      crop_json: JSON.stringify({ centerX: 0.5, centerY: 0.5, zoom: 1 }),
      content_type: "image/webp",
      declared_byte_size: 1024,
      output_byte_size: 100,
      state: "published",
      expires_at: NOW,
      created_at: NOW,
    })
    .execute();
  await fixture.database
    .updateTable("members")
    .set({ avatar_id: avatarId })
    .where("id", "=", fixture.memberId)
    .execute();
  return avatarId;
}
