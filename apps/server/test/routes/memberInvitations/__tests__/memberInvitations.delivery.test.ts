import { invitationEmailPayloadSchema } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import { runMailQueueOnce } from "../../../../src/mail/runMailQueueOnce.ts";
import { createRecordingEmailService } from "../../../helpers/createRecordingEmailService.ts";
import {
  insertInstanceSetting,
  NOW,
  shiftDays,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  expectDeliveredInvitationMail,
  expectFrozenInvitationAttribution,
  prepareFrozenInvitationFixture,
} from "./memberInvitationsTestHelpers.ts";

async function _configureInvitationSender(
  options: Readonly<{ database: DatabaseExecutor; memberId: string }>,
): Promise<void> {
  const { database, memberId } = options;
  await database
    .updateTable("members")
    .set({ display_name: "Changed", email: "changed@example.com" })
    .where("id", "=", memberId)
    .execute();
  await insertInstanceSetting(database, {
    key: "shoebox.name",
    value: "Changed Shoebox",
  });
  await insertInstanceSetting(database, {
    key: "mail.from_address",
    value: "mail@example.com",
  });
  await insertInstanceSetting(database, {
    key: "mail.from_name",
    value: "New sender",
  });
}

describe("member invitations", () => {
  it("atomically invites with the invitee's count and frozen attribution, then delivers after sender configuration", async () => {
    const { database, member, admin, close } =
      await prepareFrozenInvitationFixture();
    const invitation = await database
      .selectFrom("invitations")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(invitation.expires_at).toBe(shiftDays({ instant: NOW, days: 7 }));
    const queueRow = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(queueRow.idempotency_key).toBe(`invite:${invitation.id}:1`);
    expect(queueRow.to_member_id).toBe(member.memberId);
    const payload = invitationEmailPayloadSchema.parse(
      JSON.parse(queueRow.payload_json),
    );
    await expectFrozenInvitationAttribution({
      payload,
      member,
      database,
      admin,
    });
    const sender = createRecordingEmailService();
    await runMailQueueOnce({ database, sender, now: NOW });
    expect(sender.sent).toHaveLength(0);
    await _configureInvitationSender({ database, memberId: admin.memberId });
    await runMailQueueOnce({
      database,
      sender,
      now: shiftDays({ instant: NOW, days: 1 }),
    });
    await expectDeliveredInvitationMail({
      sender,
      member,
      database,
      queueRow,
    });
    await close();
  });
});
