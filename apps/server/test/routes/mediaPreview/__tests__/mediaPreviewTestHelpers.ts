import type { TimelineSelection } from "@memory-shoebox/shared";
import { afterEach, expect } from "vitest";

import type { Kysely } from "kysely";

import { sql } from "kysely";

import type { Database } from "../../../../src/db/types/db.types.ts";

import { createTestApp } from "../../../helpers/createTestApp.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";

import {
  insertBurst,
  insertItem,
  insertMember,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
type MediaPreviewBurstFixture = {
  frameIds: string[];
  burstId: string;
  before: string;
  after: string;
};

/**
 * Owned test-app shutdown callbacks drained by the installed media-preview
 * lifecycle.
 */
export const cleanups: Array<() => Promise<void>> = [];
/**
 * Creates a signed-in local app and uploader, exposes an authenticated media
 * POST helper and registers app shutdown.
 */
export async function createMediaPreviewContext(): Promise<
  Awaited<ReturnType<typeof createTestApp>> &
    Awaited<ReturnType<typeof insertSignedInMember>> & {
      uploaderId: string;
      post: (
        options: Readonly<{ path: string; payload: unknown }>,
      ) => Promise<
        Awaited<
          ReturnType<Awaited<ReturnType<typeof createTestApp>>["app"]["inject"]>
        >
      >;
    }
> {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  cleanups.push(context.close);
  const member = await insertSignedInMember({ database: context.database });
  const post = ({
    path,
    payload,
  }: Readonly<{ path: string; payload: unknown }>) => {
    return context.app.inject({
      method: "POST",
      url: `/api/media/${path}`,
      headers: { cookie: member.cookie },
      payload: payload as object,
    });
  };
  const uploaderId = await insertMember(context.database, { role: "uploader" });
  return { ...context, ...member, uploaderId, post };
}
/**
 * Snapshots view, activity and email tables in stable ID order to detect
 * forbidden preview side effects.
 */
export async function getMediaSideEffectsFromDatabase(
  database: Kysely<Database>,
): Promise<unknown[][]> {
  return Promise.all(
    ["item_views", "activity_events", "outbound_emails"].map((table) => {
      return sql`select * from ${sql.table(table)} order by id`
        .execute(database)
        .then((result) => {
          return result.rows;
        });
    }),
  );
}
/**
 * Seeds a burst whose capture, index and cover orders differ, plus standalone
 * neighbors on either side.
 */
export async function seedMediaPreviewBurst(
  context: Awaited<ReturnType<typeof createMediaPreviewContext>>,
): Promise<MediaPreviewBurstFixture> {
  const session = await insertUploadSession(context.database, {
    uploadedBy: context.uploaderId,
  });
  const burstId = await insertBurst(context.database, {
    uploadSessionId: session,
    capturedOn: "2026-09-27",
  });
  // Capture order deliberately differs from burst index and cover order.
  const indices = [3, 1, 2, null];
  const frameIds = await Promise.all(
    indices.map((burst_index, index) => {
      return insertItem(context.database, {
        uploadedBy: context.uploaderId,
        burst_id: burstId,
        burst_index,
        captured_at: `2026-09-27T12:0${index}:00.000Z`,
        seq: index + 10,
      });
    }),
  );
  await context.database
    .updateTable("bursts")
    .set({ cover_item_id: frameIds[2]! })
    .where("id", "=", burstId)
    .execute();
  const before = await insertItem(context.database, {
    uploadedBy: context.uploaderId,
    captured_at: "2026-09-27T11:00:00.000Z",
    seq: 1,
  });
  const after = await insertItem(context.database, {
    uploadedBy: context.uploaderId,
    captured_at: "2026-09-27T13:00:00.000Z",
    seq: 20,
  });
  return { frameIds, burstId, before, after };
}
/** Unfiltered tag/person selection used by media-neighbor requests. */
export const SELECTION = { tags: [], people: [] } satisfies TimelineSelection;
/**
 * Requires the neighbor response shape and extracts ahead/behind item IDs
 * without reordering them.
 */
export function getItemIdsFromNeighborResponse(
  body: Readonly<{
    ahead: Array<{ itemId: string }>;
    behind: Array<{ itemId: string }>;
  }>,
): { ahead: string[]; behind: string[] } {
  expect(body).toHaveProperty("ahead");
  return {
    ahead: body.ahead.map((item) => {
      return item.itemId;
    }),
    behind: body.behind.map((item) => {
      return item.itemId;
    }),
  };
}
/**
 * Registers afterEach shutdown of every owned preview-test app and drains the
 * cleanup registry.
 */
export function installMediaPreviewTestLifecycle(): void {
  afterEach(async () => {
    await Promise.all(
      cleanups.splice(0).map((close) => {
        return close();
      }),
    );
  });
}
