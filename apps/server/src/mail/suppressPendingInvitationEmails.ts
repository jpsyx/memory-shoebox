import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Retires replaceable invitation deliveries inside the resend transaction. */
export async function suppressPendingInvitationEmails(
  options: Readonly<{ transaction: DatabaseExecutor; invitationId: string }>,
): Promise<void> {
  await options.transaction
    .updateTable("outbound_emails")
    .set({
      state: "suppressed",
      next_attempt_at: null,
      last_error_code: "invitation_superseded",
      last_error_message: "A newer invitation replaced this pending delivery.",
    })
    .where("kind", "=", "invitation")
    .where("trigger_kind", "=", "invitation")
    .where("trigger_id", "=", options.invitationId)
    .where((expression) => {
      return expression.or([
        expression("state", "in", ["queued", "sending"]),
        expression.and([
          expression("state", "=", "failed"),
          expression("last_error_code", "=", "base_url_unset"),
        ]),
      ]);
    })
    .execute();
}
