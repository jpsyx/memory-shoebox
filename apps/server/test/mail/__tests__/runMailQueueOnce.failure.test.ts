import { describe, expect, it, vi } from "vitest";
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

describe("a message the mail worker cannot send", () => {
  it("backs off a refusal, and gives up after the fifth attempt", async () => {
    const { database, sender } = await createMailContext();
    await queueSignInCode(database);
    sender.failWith = {
      code: "validation_error",
      message: "domain not verified",
    };

    const backoffMinutes = [1, 5, 25, 120];
    let at = NOW;
    for (const [index, minutes] of backoffMinutes.entries()) {
      const summary = await runMailQueueOnce({ database, sender, now: at });
      expect(summary.failedCount).toBe(1);
      const row = await database
        .selectFrom("outbound_emails")
        .select(["state", "attempts", "next_attempt_at", "last_error_code"])
        .executeTakeFirstOrThrow();
      expect(row.state).toBe("queued");
      expect(row.attempts).toBe(index + 1);
      expect(row.last_error_code).toBe("validation_error");
      expect(row.next_attempt_at).toBe(
        shiftMinutes({ instant: at, minutes: minutes }),
      );
      at = shiftMinutes({ instant: at, minutes: minutes });
    }

    await runMailQueueOnce({ database, sender, now: at });

    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "payload_json", "subject"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.attempts).toBe(5);
    expect(row.payload_json).toBe("{}");
    expect(row.subject).toBe("Your code");
    await database.destroy();
  });

  it("fails a kind whose copy has not been written yet", async () => {
    // Empty the registry rather than pointing the row at whichever kind
    // happens to lack copy today. Naming a kind ties this test to that kind's
    // backlog: it stops testing anything the moment the copy for it ships,
    // and has to be repointed at the next kind still waiting. Taking every
    // template away asserts the same condition and stays true however many
    // kinds gain one.
    vi.resetModules();
    vi.doMock("../../../src/mail/templates/emailTemplates.constants.ts", () => {
      return { EMAIL_RENDERERS: {} };
    });
    const { runMailQueueOnce: runWithNoTemplates } =
      await import("../../../src/mail/runMailQueueOnce.ts");

    const { database, sender } = await createMailContext();
    await insertOutboundEmail(database, {
      kind: "comment",
      subject: "Abuela said something",
      payload_json: JSON.stringify({ commentBody: "He has your chin." }),
      trigger_kind: "comment",
      idempotency_key: "comment:one:two",
    });

    const summary = await runWithNoTemplates({ database, sender, now: NOW });

    expect(summary.failedCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.last_error_code).toBe("no_template");
    await database.destroy();
    vi.doUnmock("../../../src/mail/templates/emailTemplates.constants.ts");
    vi.resetModules();
  });

  it("scrubs a sign-in code it cannot render, because that row is terminal too", async () => {
    // `sign_in_code` has copy today, so the only way to reach the no-template
    // branch with that kind is to take the copy away. This is the case a later
    // step creates by shipping a caller before its template: the row goes
    // terminal holding six live-looking digits in its subject line.
    vi.resetModules();
    vi.doMock("../../../src/mail/templates/emailTemplates.constants.ts", () => {
      return { EMAIL_RENDERERS: {} };
    });
    const { runMailQueueOnce: runWithNoTemplates } =
      await import("../../../src/mail/runMailQueueOnce.ts");

    const { database, sender } = await createMailContext();
    await insertOutboundEmail(database, {
      subject: "Your code is 410233",
      payload_json: JSON.stringify({ code: "410233" }),
    });

    const summary = await runWithNoTemplates({ database, sender, now: NOW });

    expect(summary.failedCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "last_error_code", "subject", "payload_json"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.last_error_code).toBe("no_template");
    expect(row.subject).toBe("Your code");
    expect(row.payload_json).toBe("{}");
    await database.destroy();
    vi.doUnmock("../../../src/mail/templates/emailTemplates.constants.ts");
    vi.resetModules();
  });

  it("fails a row whose stored payload no longer matches its schema", async () => {
    // The row is valid JSON and names a kind that has copy, so it gets all the
    // way to the renderer before anything objects. What objects is the schema,
    // and this is the only test that reaches that throw: every other malformed
    // payload here is turned away earlier, by suppression, by a deferral, or by
    // a template that was mocked out of existence.
    //
    // It is pinned because the parse is load-bearing and its location is a
    // design decision. It lives in `apps/server` so that a row written by an
    // older build fails loudly here rather than rendering as something subtly
    // wrong in `packages/emails`. Move the parse into the package and this is
    // the test that notices.
    const { database, sender } = await createMailContext();
    await insertOutboundEmail(database, {
      subject: "Your code is 410233",
      payload_json: JSON.stringify({ code: "410233" }),
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toMatchObject({ failedCount: 1, sentCount: 0 });
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "last_error_code"])
      .executeTakeFirstOrThrow();
    // Retried rather than abandoned: a payload the current build cannot parse
    // is the shape a deploy fixes, so the row waits for the next one.
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.last_error_code).toBe("render_failed");
    await database.destroy();
  });
});
