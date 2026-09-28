import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { Viewer } from "../../../src/http/requestContextHelpers.ts";
import { getVisibleRuleIdsFromMemberId } from "../../../src/visibility/getVisibleRuleIdsFromMemberId.ts";

/** A viewer built from the real expansion, which is what a request holds. */
export async function makeViewerFromMemberId(options: {
  database: Kysely<Database>;
  memberId: string;
  role?: Viewer["role"];
}): Promise<Viewer> {
  const role = options.role ?? "viewer";
  return {
    memberId: options.memberId,
    sessionId: createId(),
    role,
    isAdmin: role === "admin",
    visibleRuleIds: await getVisibleRuleIdsFromMemberId({
      database: options.database,
      memberId: options.memberId,
    }),
  };
}
