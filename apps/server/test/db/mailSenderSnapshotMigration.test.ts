import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import {
  NOW,
  insertInstanceSetting,
  insertOutboundEmail,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { queueSignInCode } from "../mail/__tests__/runMailQueueOnceTestHelpers.ts";
import { createRecordingEmailService } from "../helpers/createRecordingEmailService.ts";
import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";

it.each(["0012", "0013"])(
  "upgrades populated mail from before %s without rewriting queue keys, payloads or sent history",
  async (firstPendingMigration) => {
    const database = createDatabase(":memory:");
    try {
      const sources = await getMigrationSourcesFromFiles();
      await migrateToLatest(database, {
        sources: Object.fromEntries(
          Object.entries(sources).filter(([name]) => {
            return name < firstPendingMigration;
          }),
        ),
      });
      await insertInstanceSetting(database, {
        key: "public.base_url",
        value: "https://legacy.example",
      });
      await queueSignInCode(database);
      await database
        .updateTable("outbound_emails")
        .set({ attempts: 1 })
        .execute();
      await insertOutboundEmail(database, {
        state: "sent",
        from_address: "historic@example.com",
        provider_message_id: "historic-message",
      });
      const before = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .orderBy("id")
        .execute();
      await migrateToLatest(database);
      const after = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .orderBy("id")
        .execute();
      expect(after).toEqual(
        before.map((row) => {
          return { ...row, sender_snapshot_json: null };
        }),
      );
      await insertInstanceSetting(database, {
        key: "mail.from_address",
        value: "current@example.com",
      });
      const sender = createRecordingEmailService();
      expect(
        (await runMailQueueOnce({ database, sender, now: NOW })).sentCount,
      ).toBe(1);
      expect(sender.sent[0]?.from).toBe("My Shoebox <current@example.com>");
      expect(sender.sent[0]?.idempotencyKey).toBe(
        before.find((row) => {
          return row.state === "queued";
        })!.idempotency_key,
      );
      expect(
        await database
          .selectFrom("outbound_emails")
          .selectAll()
          .where("provider_message_id", "=", "historic-message")
          .executeTakeFirst(),
      ).toEqual(
        after.find((row) => {
          return row.state === "sent";
        }),
      );
    } finally {
      await database.destroy();
    }
  },
);
