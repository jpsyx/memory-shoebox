import { sql, type Kysely, type SqlBool } from "kysely";
import type { Database } from "../db/types.ts";

/** What one run changed. */
export type InvitationLapseSummary = {
  lapsedCount: number;
};

/**
 * Removes any `invited` member whose latest invitation has expired unrevoked.
 *
 * **Without this a lapsed invitation stays signable forever**
 * (`conventions.md` § The job runner), because no token ever gated it:
 * `members.status` alone decides whether an address may sign in
 * (`data-models.md` § `invitations`, Decision 2). The expiry is therefore not
 * enforced by the invitation at all, it is enforced here.
 *
 * "Latest" is the largest id, because ids are uuidv7 and sort by creation. A
 * resend writes a new row, so an admin who sent it again yesterday keeps the
 * member invited even though the first invitation has expired.
 */
export async function runInvitationLapse(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<InvitationLapseSummary> {
  const result = await options.database
    .updateTable("members")
    .set({ status: "removed", removed_at: options.now })
    .where("status", "=", "invited")
    .where(
      sql<SqlBool>`EXISTS (
        SELECT 1
        FROM invitations AS latest
        WHERE latest.member_id = members.id
          AND latest.id = (
            SELECT max(any_invitation.id)
            FROM invitations AS any_invitation
            WHERE any_invitation.member_id = members.id
          )
          AND latest.revoked_at IS NULL
          AND latest.accepted_at IS NULL
          AND latest.expires_at <= ${options.now}
      )`,
    )
    .executeTakeFirst();

  return { lapsedCount: Number(result.numUpdatedRows) };
}
