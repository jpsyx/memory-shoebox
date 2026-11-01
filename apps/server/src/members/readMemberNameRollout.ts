import {
  getLegacyRolloutFromDatabase,
  type MemberNameRollout,
} from "../db/migrations/0019_member_name_claims.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
export type { MemberNameRollout } from "../db/migrations/0019_member_name_claims.ts";

/**
 * Read an offline-only audit. Never expose fallback names through member
 * APIs.
 */
export async function readMemberNameRollout(
  database: DatabaseExecutor,
): Promise<MemberNameRollout> {
  return getLegacyRolloutFromDatabase(database);
}
