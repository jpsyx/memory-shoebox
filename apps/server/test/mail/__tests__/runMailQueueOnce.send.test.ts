import { describe, expect, it } from "vitest";
import { runMailQueueOnce } from "../../../src/mail/runMailQueueOnce.ts";
import {
  NOW,
  insertOutboundEmail,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMailContext,
  queueSignInCode,
} from "./runMailQueueOnceTestHelpers.ts";

describe("the mail worker's send pass", () => {
  it("does nothing against an empty queue", async () => {
    const { database, sender } = await createMailContext();

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toEqual({
      sentCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      deferredCount: 0,
    });
    expect(sender.sent).toEqual([]);
    await database.destroy();
  });

  it("sends a queued message and marks it sent", async () => {
    const { database, sender } = await createMailContext();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.sentCount).toBe(1);
    expect(sender.sent[0]?.from).toBe("My Shoebox <shoebox@example.com>");
    expect(sender.sent[0]?.to).toBe("rosa@example.com");
    expect(sender.sent[0]?.subject).toBe("Your code is 410233");
    expect(sender.sent[0]?.html).toContain("410233");
    expect(sender.sent[0]?.text).toContain("410233");

    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("sent");
    expect(row.sent_at).toBe(NOW);
    expect(row.from_address).toBe("shoebox@example.com");
    expect(row.provider_message_id).toBe("fake-1");
    await database.destroy();
  });

  it("scrubs both payload_json and subject on a terminal sign_in_code row", async () => {
    const { database, sender } = await createMailContext();
    await queueSignInCode(database);

    await runMailQueueOnce({ database, sender, now: NOW });

    const row = await database
      .selectFrom("outbound_emails")
      .select(["payload_json", "subject"])
      .executeTakeFirstOrThrow();
    expect(row.payload_json).toBe("{}");
    expect(row.subject).toBe("Your code");
    await database.destroy();
  });

  it("claims each row once, so a second run finds nothing", async () => {
    const { database, sender } = await createMailContext();
    await queueSignInCode(database);

    await runMailQueueOnce({ database, sender, now: NOW });
    const second = await runMailQueueOnce({ database, sender, now: NOW });

    expect(second.sentCount).toBe(0);
    expect(sender.sent).toHaveLength(1);
    await database.destroy();
  });

  it("leaves a row whose send_after has not arrived", async () => {
    const { database, sender } = await createMailContext();
    await insertOutboundEmail(database, {
      send_after: shiftMinutes({ instant: NOW, minutes: 60 }),
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toEqual({
      sentCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      deferredCount: 0,
    });
    expect(sender.sent).toEqual([]);
    // Left alone means untouched, not merely unsent: a worker that claimed
    // the row, spent an attempt and failed it would send nothing either.
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "next_attempt_at", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.next_attempt_at).toBeNull();
    expect(row.last_error_code).toBeNull();
    await database.destroy();
  });

  it("claims each row once when two passes run at the same time", async () => {
    const { database, sender } = await createMailContext();
    await queueSignInCode(database);
    await queueSignInCode(database);

    const [first, second] = await Promise.all([
      runMailQueueOnce({ database, sender, now: NOW }),
      runMailQueueOnce({ database, sender, now: NOW }),
    ]);

    expect(first.sentCount + second.sentCount).toBe(2);
    expect(sender.sent).toHaveLength(2);
    const keys = sender.sent.map((request) => {
      return request.idempotencyKey;
    });
    expect(new Set(keys).size).toBe(2);
    const states = await database
      .selectFrom("outbound_emails")
      .select("state")
      .execute();
    expect(
      states.map((row) => {
        return row.state;
      }),
    ).toEqual(["sent", "sent"]);
    await database.destroy();
  });
});
