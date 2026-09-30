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

describe("the mail worker with nowhere to send from", () => {
  it("defers rather than spending an attempt when mail.from_address is unset", async () => {
    const { database, sender } = await createMailContext({ configured: false });
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toMatchObject({ deferredCount: 1, sentCount: 0 });
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "last_error_code", "next_attempt_at"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("from_address_unset");
    expect(row.next_attempt_at).toBe(
      shiftMinutes({ instant: NOW, minutes: 5 }),
    );
    await database.destroy();
  });

  it("defers the same way when there is no API key at all", async () => {
    const { database } = await createMailContext();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({
      database,
      sender: undefined,
      now: NOW,
    });

    expect(summary.deferredCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("provider_unconfigured");
    await database.destroy();
  });

  it("leaves an attempt count it did not spend alone when it defers", async () => {
    const { database, sender } = await createMailContext({ configured: false });
    await insertOutboundEmail(database, {
      attempts: 3,
      next_attempt_at: shiftMinutes({ instant: NOW, minutes: -1 }),
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.deferredCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "next_attempt_at"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(3);
    expect(row.next_attempt_at).toBe(
      shiftMinutes({ instant: NOW, minutes: 5 }),
    );
    await database.destroy();
  });
});
