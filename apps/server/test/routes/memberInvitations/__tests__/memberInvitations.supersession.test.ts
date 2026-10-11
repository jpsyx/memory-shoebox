import { sql } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { runMailQueueOnce } from "../../../../src/mail/runMailQueueOnce.ts";
import { EMAIL_RENDERERS } from "../../../../src/mail/templates/emailTemplates.constants.ts";
import { MailSendError } from "../../../../src/mail/MailSendError.ts";
import { createRecordingEmailService } from "../../../helpers/createRecordingEmailService.ts";
import {
  insertInstanceSetting,
  insertOutboundEmail,
  NOW,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { queueSignInCode } from "../../../mail/__tests__/runMailQueueOnceTestHelpers.ts";
import { createMemberInvitationsFixture } from "./memberInvitationsTestHelpers.ts";

const RESEND_NOW = shiftMinutes({ instant: NOW, minutes: 2 });
const RETRY_NOW = shiftMinutes({ instant: NOW, minutes: 60 });

async function _fixture() {
  let now = NOW;
  const context = await createMemberInvitationsFixture({
    clock: () => {
      return new Date(now);
    },
  });
  await insertInstanceSetting(context.database, {
    key: "mail.from_address",
    value: "mail@example.com",
  });
  const invited = await context.invite({
    email: "ana@example.com",
    role: "viewer",
  });
  expect(invited.statusCode).toBe(201);
  const oldRow = await context.database
    .selectFrom("outbound_emails")
    .selectAll()
    .executeTakeFirstOrThrow();
  now = RESEND_NOW;
  const resend = async () => {
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: `/api/members/${invited.json().memberId}/invitation/resend`,
          headers: { cookie: context.admin.cookie },
        })
      ).statusCode,
    ).toBe(200);
  };
  return { ...context, oldRow, resend };
}

describe("superseded invitations", () => {
  it.each([false, true])(
    "resends only fresh URL copy after settings change, with backoff=%s",
    async (hasBackoff) => {
      const { app, database, admin, oldRow, resend, close } = await _fixture();
      const sender = createRecordingEmailService();
      if (hasBackoff) {
        sender.failWith = {
          code: "503",
          message: "Temporary provider refusal",
        };
        await runMailQueueOnce({ database, sender, now: NOW });
        await database
          .updateTable("outbound_emails")
          .set({ next_attempt_at: RETRY_NOW })
          .where("id", "=", oldRow.id)
          .execute();
        sender.failWith = null;
      }
      const historicalId = await insertOutboundEmail(database, {
        kind: "invitation",
        state: "sent",
        trigger_kind: "invitation",
        trigger_id: oldRow.trigger_id,
        sent_at: NOW,
      });
      const unrelatedId = await insertOutboundEmail(database, {
        state: "queued",
        send_after: shiftMinutes({ instant: RETRY_NOW, minutes: 60 }),
      });
      const preserved = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .where("id", "in", [historicalId, unrelatedId])
        .orderBy("id")
        .execute();
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/settings",
            headers: { cookie: admin.cookie },
            payload: { public: { baseUrl: "https://new.example" } },
          })
        ).statusCode,
      ).toBe(200);
      await resend();
      await runMailQueueOnce({ database, sender, now: RESEND_NOW });
      await runMailQueueOnce({ database, sender, now: RETRY_NOW });
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]?.text).toContain(
        "https://new.example/join?address=ana%40example.com",
      );
      expect(sender.sent[0]?.text).not.toContain("https://shoebox.example");
      const retired = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .where("id", "=", oldRow.id)
        .executeTakeFirstOrThrow();
      expect(retired.state).toBe("suppressed");
      expect(retired.payload_json).toBe(oldRow.payload_json);
      expect(retired.idempotency_key).toBe(oldRow.idempotency_key);
      expect(sender.sent[0]?.idempotencyKey).toBe(
        `invite:${oldRow.trigger_id}:2`,
      );
      expect(
        await database
          .selectFrom("outbound_emails")
          .selectAll()
          .where("id", "in", [historicalId, unrelatedId])
          .orderBy("id")
          .execute(),
      ).toEqual(preserved);
      await close();
    },
  );

  it("rolls back suppression and invitation renewal when replacement enqueue fails", async () => {
    const { app, database, admin, oldRow, close } = await _fixture();
    const invitationBefore = await database
      .selectFrom("invitations")
      .selectAll()
      .executeTakeFirstOrThrow();
    await sql`create trigger reject_replacement before insert on outbound_emails begin select raise(abort, 'test refusal'); end`.execute(
      database,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/members/${oldRow.to_member_id}/invitation/resend`,
          headers: { cookie: admin.cookie },
        })
      ).statusCode,
    ).toBe(500);
    expect(
      await database
        .selectFrom("invitations")
        .selectAll()
        .executeTakeFirstOrThrow(),
    ).toEqual(invitationBefore);
    expect(
      await database
        .selectFrom("outbound_emails")
        .selectAll()
        .executeTakeFirstOrThrow(),
    ).toEqual(oldRow);
    await close();
  });

  it("skips an older row already selected by the same worker pass", async () => {
    const { database, oldRow, resend, close } = await _fixture();
    await database
      .updateTable("outbound_emails")
      .set({ send_after: RESEND_NOW })
      .where("id", "=", oldRow.id)
      .execute();
    await queueSignInCode(database);
    const sender = createRecordingEmailService();
    await runMailQueueOnce({
      database,
      now: RESEND_NOW,
      sender: {
        send: async (request) => {
          const result = await sender.send(request);
          if (request.subject === "Your code is 410233") {
            await resend();
          }
          return result;
        },
      },
    });
    expect(sender.sent).toHaveLength(1);
    await runMailQueueOnce({ database, sender, now: RESEND_NOW });
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1]?.idempotencyKey).toBe(
      `invite:${oldRow.trigger_id}:2`,
    );
    await close();
  });

  it("keeps superseded unset-URL failures out of later URL repair", async () => {
    const { app, database, admin, oldRow, resend, close } = await _fixture();
    await database
      .updateTable("outbound_emails")
      .set({ state: "failed", last_error_code: "base_url_unset" })
      .where("id", "=", oldRow.id)
      .execute();
    await resend();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/settings",
          headers: { cookie: admin.cookie },
          payload: { public: { baseUrl: "https://repaired.example" } },
        })
      ).statusCode,
    ).toBe(200);
    const sender = createRecordingEmailService();
    await runMailQueueOnce({ database, sender, now: RESEND_NOW });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.idempotencyKey).toBe(
      `invite:${oldRow.trigger_id}:2`,
    );
    await close();
  });

  it("does not resurrect an older invitation when its in-flight provider call fails", async () => {
    const { database, oldRow, resend, close } = await _fixture();
    await runMailQueueOnce({
      database,
      now: NOW,
      sender: {
        send: async () => {
          await resend();
          throw new MailSendError({
            code: "503",
            message: "Temporary provider refusal",
          });
        },
      },
    });
    const retired = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .where("id", "=", oldRow.id)
      .executeTakeFirstOrThrow();
    expect(retired.state).toBe("suppressed");
    expect(retired.payload_json).toBe(oldRow.payload_json);
    const sender = createRecordingEmailService();
    await runMailQueueOnce({ database, sender, now: RETRY_NOW });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.idempotencyKey).toBe(
      `invite:${oldRow.trigger_id}:2`,
    );
    await close();
  });

  it("records actual success when a superseded provider request was already active", async () => {
    const { database, oldRow, resend, close } = await _fixture();
    await runMailQueueOnce({
      database,
      now: NOW,
      sender: {
        send: async () => {
          await resend();
          expect(
            (
              await database
                .selectFrom("outbound_emails")
                .select("state")
                .where("id", "=", oldRow.id)
                .executeTakeFirstOrThrow()
            ).state,
          ).toBe("suppressed");
          return { providerMessageId: "already-accepted" };
        },
      },
    });
    const delivered = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .where("id", "=", oldRow.id)
      .executeTakeFirstOrThrow();
    expect(delivered.state).toBe("sent");
    expect(delivered.provider_message_id).toBe("already-accepted");
    expect(delivered.payload_json).toBe(oldRow.payload_json);
    await close();
  });

  it("checks a claimed invitation again after rendering before calling the provider", async () => {
    const { database, oldRow, resend, close } = await _fixture();
    const originalRenderer = EMAIL_RENDERERS.invitation;
    const renderer = vi
      .spyOn(EMAIL_RENDERERS, "invitation")
      .mockImplementationOnce(async (payload) => {
        const rendered = await originalRenderer(payload);
        await resend();
        return rendered;
      });
    try {
      const sender = createRecordingEmailService();
      await runMailQueueOnce({ database, sender, now: NOW });
      expect(sender.sent).toHaveLength(0);
      await runMailQueueOnce({ database, sender, now: RESEND_NOW });
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]?.idempotencyKey).toBe(
        `invite:${oldRow.trigger_id}:2`,
      );
    } finally {
      renderer.mockRestore();
      await close();
    }
  });
});
