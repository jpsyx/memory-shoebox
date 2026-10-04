import { expect } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { DueRemovalReminder } from "../../../src/jobs/runRemovalReminder.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRemovalRequest,
  shiftDays,
} from "../../helpers/seedHelpers/seedHelpers.ts";

type RemovalReminderTestContext = {
  database: Kysely<Database>;
  uploaderId: string;
  adminId: string;
  requesterId: string;
  itemId: string;
  requestId: string;
};

type OpenRequestContext = {
  requestOverrides?: Partial<Database["removal_requests"]>;
  uploaderOverrides?: Partial<Database["members"]>;
  requesterOverrides?: Partial<Database["members"]>;
};

/** Opens a real migrated catalog with one open request and active recipients. */
export async function createReminderContextWithOpenRequest(
  options: Readonly<OpenRequestContext> = {},
): Promise<RemovalReminderTestContext> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const uploaderId = await insertMember(database, {
    role: "uploader",
    ...options.uploaderOverrides,
  });
  const adminId = await insertMember(database, { role: "admin" });
  const requesterId = await insertMember(database, {
    role: "viewer",
    ...options.requesterOverrides,
  });
  const itemId = await insertItem(database, { uploadedBy: uploaderId });
  const requestId = await insertRemovalRequest(database, {
    requestedByMemberId: requesterId,
    itemUploaderMemberId: uploaderId,
    item_id: itemId,
    state: "open",
    decline_reason: null,
    resolved_at: null,
    resolved_by_member_id: null,
    created_at: shiftDays({ instant: NOW, days: -8 }),
    ...options.requestOverrides,
  });
  return { database, uploaderId, adminId, requesterId, itemId, requestId };
}

/** Compares stored outbound keys with the job's returned due identities. */
export async function expectPersistedReminderKeys(
  options: Readonly<{
    database: Kysely<Database>;
    due: readonly DueRemovalReminder[];
  }>,
): Promise<void> {
  const emails = await options.database
    .selectFrom("outbound_emails")
    .selectAll()
    .execute();
  expect(
    new Set(
      emails.map((email) => {
        return email.idempotency_key;
      }),
    ),
  ).toEqual(
    new Set(
      options.due.map((due) => {
        return due.idempotencyKey;
      }),
    ),
  );
}
