import { sql, type Kysely, type SqlBool } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { bumpVisibilityGeneration } from "../visibility/bumpVisibilityGeneration.ts";

/** What one run changed. */
export type InvitationLapseSummary = {
  lapsedCount: number;
};

async function _getLapsedMemberIds(
  options: Readonly<{ transaction: DatabaseExecutor; now: string }>,
): Promise<string[]> {
  const { transaction, now } = options;
  const members = await transaction
    .selectFrom("members")
    .select("id")
    .where("status", "=", "invited")
    .where(
      sql<SqlBool>`EXISTS (
      SELECT 1 FROM invitations AS latest
      WHERE latest.member_id = members.id
        AND latest.id = (SELECT max(history.id) FROM invitations AS history WHERE history.member_id = members.id)
        AND latest.revoked_at IS NULL
        AND latest.accepted_at IS NULL
        AND latest.expires_at <= ${now}
    )`,
    )
    .execute();
  return members.map((member) => {
    return member.id;
  });
}

/**
 * Removes invited members whose latest invitation across all history is unspent
 * and expired. Resends extend that same row's expiry rather than inserting one.
 * Status, devices, memberships and visibility invalidation commit together;
 * authentication continues to use member status as its sole invitation gate.
 */
export async function runInvitationLapse(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<InvitationLapseSummary> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const memberIds = await _getLapsedMemberIds({
        transaction,
        now: options.now,
      });
      if (memberIds.length === 0) {
        return { lapsedCount: 0 };
      }
      await transaction
        .updateTable("members")
        .set({ status: "removed", removed_at: options.now })
        .where("id", "in", memberIds)
        .execute();
      await transaction
        .deleteFrom("sessions")
        .where("member_id", "in", memberIds)
        .execute();
      await transaction
        .deleteFrom("group_members")
        .where("member_id", "in", memberIds)
        .execute();
      await bumpVisibilityGeneration({
        executor: transaction,
        now: options.now,
      });
      return { lapsedCount: memberIds.length };
    },
  });
}
