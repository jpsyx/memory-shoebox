import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createEmailService } from "../../src/mail/EmailService/createEmailService.ts";
import { enqueueEmail } from "../../src/mail/enqueueEmail.ts";
import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";
import {
  NOW,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Kysely } from "kysely";

/** Whether the browser the fake needs has been downloaded. */
async function _hasChromium(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

describe("a message sent in fake email mode", () => {
  let database: Kysely<Database>;
  let directory: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    directory = mkdtempSync(join(tmpdir(), "shoebox-fake-delivery-"));
    // Three settings, each for its own reason. Without an absolute base URL
    // the enqueue writes the row `failed` and scrubs the digits, so there
    // would be nothing to deliver. Without a sending identity the worker
    // defers the row instead of sending it, because the instance is not
    // configured to send yet, and the test would pass its assertions about
    // nothing.
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "shoebox@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_name",
      value: "My Shoebox",
    });
  });

  afterEach(async () => {
    rmSync(directory, { recursive: true, force: true });
    await database.destroy();
  });

  it("reaches a PDF, and the row says it was sent", async ({ skip }) => {
    if (!(await _hasChromium())) {
      skip("chromium is not installed: run `npx playwright install chromium`");
    }
    const service = createEmailService({
      config: createTestConfig({ ENABLE_FAKE_EMAIL: "true" }),
      fakeOutputDirectory: directory,
    });
    expect(service).toBeDefined();

    await enqueueEmail({
      executor: database,
      input: {
        kind: "sign_in_code",
        toAddress: "abuela@example.com",
        toMemberId: undefined,
        toDisplayName: "Abuela Rosa",
        idempotencyKey: "signin:one",
        payload: {
          code: "410233",
          expiresAt: NOW,
          expiresInMinutes: 10,
        },
        triggerKind: "sign_in_code",
        triggerId: "one",
      },
      now: NOW,
    });

    const summary = await runMailQueueOnce({
      database,
      sender: service,
      now: NOW,
    });

    // `deferredCount` is the one to watch: a row the worker put back because
    // the instance is not configured to send is not a failure, and it is
    // what this test would otherwise quietly be asserting nothing about.
    expect(summary).toMatchObject({ sentCount: 1, deferredCount: 0 });
    expect(readdirSync(directory)).toHaveLength(1);

    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "provider_message_id"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("sent");
    expect(row.provider_message_id).toContain("fake-pdf");
  }, 60_000);
});
