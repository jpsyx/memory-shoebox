import { describe, expect, it } from "vitest";
import { createId } from "../../../src/db/createId.ts";
import { runMailQueueOnce } from "../../../src/mail/runMailQueueOnce.ts";
import {
  NOW,
  insertOutboundEmail,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMailContext,
  queueSignInCode,
} from "./runMailQueueOnceTestHelpers.ts";

describe("the mail worker against a suppressed address", () => {
  it("suppresses a non-sign-in message to a suppressed address, without sending", async () => {
    const { database, sender } = await createMailContext();
    await database
      .insertInto("email_suppressions")
      .values({
        id: createId(),
        address: "rosa@example.com",
        reason: "complained",
        created_at: NOW,
        cleared_at: null,
      })
      .execute();
    await insertOutboundEmail(database, {
      kind: "comment",
      trigger_kind: "comment",
      idempotency_key: "comment:one:two",
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.suppressedCount).toBe(1);
    expect(sender.sent).toEqual([]);
    const row = await database
      .selectFrom("outbound_emails")
      .select("state")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("suppressed");
    await database.destroy();
  });

  it("still sends a sign-in code to a suppressed address", async () => {
    const { database, sender } = await createMailContext();
    await database
      .insertInto("email_suppressions")
      .values({
        id: createId(),
        address: "rosa@example.com",
        reason: "complained",
        created_at: NOW,
        cleared_at: null,
      })
      .execute();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.sentCount).toBe(1);
    await database.destroy();
  });
});
