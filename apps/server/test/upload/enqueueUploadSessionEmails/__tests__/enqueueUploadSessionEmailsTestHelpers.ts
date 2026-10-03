import type { Kysely } from "kysely";
import { expect } from "vitest";
import {
  uploadSessionEmailPayloadSchema,
  type UploadSessionEmailPayload,
} from "@memory-shoebox/shared";
import { createDatabase } from "../../../../src/db/client.ts";
import { migrateToLatest } from "../../../../src/db/migrate.ts";
import type { Database } from "../../../../src/db/types/db.types.ts";

import {
  NOW,
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** A queued upload email and its validated payload. */
export type UploadEmailRecord = {
  memberId: string | null;
  subject: string;
  idempotencyKey: string;
  payload: UploadSessionEmailPayload;
};

/** Inputs for _insertBatchItems. */
export type InsertBatchItemsOptions = {
  uploaderId: string;
  sessionId: string;
  capturedOn: string;
  count: number;
  firstSeq: number;
  visibilityRuleId?: string;
};

/** A migrated database with a base URL, an uploader and one settled batch. */
export async function createUploadTestContext(): Promise<{
  database: Kysely<Database>;
  uploaderId: string;
  sessionId: string;
}> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example.com",
  });
  const uploaderId = await insertMember(database, { display_name: "Papá" });
  const sessionId = await insertUploadSession(database, {
    uploadedBy: uploaderId,
    state: "settled",
    settled_at: NOW,
  });
  return { database, uploaderId, sessionId };
}

/** Inserts `count` items of the batch on one day, under one rule. */
export async function insertBatchItems(
  functionOptions: Readonly<{
    database: Kysely<Database>;
    options: InsertBatchItemsOptions;
  }>,
): Promise<void> {
  const { database, options } = functionOptions;

  await Promise.all(
    Array.from({ length: options.count }, (_unused, index) => {
      return insertItem(database, {
        uploadedBy: options.uploaderId,
        upload_session_id: options.sessionId,
        captured_on: options.capturedOn,
        captured_at: `${options.capturedOn}T09:00:00.000Z`,
        seq: options.firstSeq + index,
        ...(options.visibilityRuleId === undefined
          ? {}
          : { visibility_rule_id: options.visibilityRuleId }),
      });
    }),
  );
}

/**
 * Every `upload_session` row, with its payload parsed.
 *
 * Every stored payload must also pass the shared schema, `superRefine`
 * included (the first, last and busiest days, and the counts, must agree), so
 * a payload that the template could not render fails here, in every test.
 */
export async function readUploadEmails(
  database: Kysely<Database>,
): Promise<UploadEmailRecord[]> {
  const rows = await database
    .selectFrom("outbound_emails")
    .select(["to_member_id", "subject", "payload_json", "idempotency_key"])
    .where("kind", "=", "upload_session")
    .execute();
  return rows.map((row) => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse(JSON.parse(row.payload_json))
        .success,
    ).toBe(true);
    return {
      memberId: row.to_member_id,
      subject: row.subject,
      idempotencyKey: row.idempotency_key,
      payload: JSON.parse(row.payload_json) as UploadSessionEmailPayload,
    };
  });
}
