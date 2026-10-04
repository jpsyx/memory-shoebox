import type { Kysely } from "kysely";
import { createDatabase } from "../../../src/db/client.ts";
import { createId } from "../../../src/db/createId.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { enqueueEmail } from "../../../src/mail/enqueueEmail/enqueueEmail.ts";
import {
  createRecordingEmailService,
  type RecordingEmailService,
} from "../../helpers/createRecordingEmailService.ts";
import {
  NOW,
  insertInstanceSetting,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/** One migrated catalog and the sender that records what left it. */
export type MailContext = {
  database: Kysely<Database>;
  sender: RecordingEmailService;
};

/**
 * A queue ready to run against.
 *
 * `configured: false` leaves `mail.from_address` unset, which is the
 * unconfigured Shoebox the worker has to defer on rather than fail.
 */
export async function createMailContext(
  options: { configured?: boolean } = {},
): Promise<MailContext> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  if (options.configured !== false) {
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "shoebox@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_name",
      value: "My Shoebox",
    });
  }
  return { database, sender: createRecordingEmailService() };
}

/** Queues one sign-in code, the one kind that outranks a suppression. */
export async function queueSignInCode(
  database: Kysely<Database>,
): Promise<void> {
  const codeId = createId();
  await enqueueEmail({
    executor: database,
    now: NOW,
    input: {
      kind: "sign_in_code",
      toAddress: "rosa@example.com",
      toMemberId: undefined,
      toDisplayName: "Abuela Rosa",
      idempotencyKey: `signin:${codeId}`,
      payload: {
        code: "410233",
        expiresAt: shiftMinutes({ instant: NOW, minutes: 10 }),
        expiresInMinutes: 10,
      },
      triggerKind: "sign_in_code",
      triggerId: codeId,
    },
  });
}
