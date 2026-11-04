import type { Selectable } from "kysely";
import type { Database, DatabaseExecutor } from "../../db/types/db.types.ts";
import { getVisibleRuleIdsFromMemberId } from "../../visibility/getVisibleRuleIdsFromMemberId.ts";
import { getMemberRoleFromStoredValue } from "../../members/getMemberRoleFromStoredValue.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { readDigestSource } from "./readDigestSource.ts";
import type { EligibleDigestEvent } from "./digest.types.ts";
export type { EligibleDigestEvent } from "./digest.types.ts";

type EligibilityOptions = Readonly<{
  executor: DatabaseExecutor;
  memberId: string;
  eventIds: readonly string[];
  mode: "preparation" | "delivery";
}>;
type Member = Selectable<Database["members"]>;

async function _readSources(
  options: EligibilityOptions,
  member: Member,
  viewer: Viewer,
): Promise<{ eligible: EligibleDigestEvent[]; cancelledIds: string[] }> {
  const eligible: EligibleDigestEvent[] = [];
  const cancelledIds: string[] = [];
  for (const id of options.eventIds) {
    const event = await options.executor
      .selectFrom("notification_digest_events")
      .selectAll()
      .where("id", "=", id)
      .where("member_id", "=", member.id)
      .executeTakeFirst();
    if (!event) {
      cancelledIds.push(id);
      continue;
    }
    const frequency =
      event.category === "upload"
        ? member.notify_upload_frequency
        : event.category === "comment"
          ? member.notify_comment_frequency
          : member.notify_comment_tag_frequency;
    const source =
      frequency === "off" ||
      (options.mode === "preparation" && frequency !== "daily")
        ? null
        : await readDigestSource({ executor: options.executor, viewer, event });
    if (source) {
      eligible.push(source);
    } else {
      cancelledIds.push(id);
    }
  }
  return { eligible, cancelledIds };
}

/** Rechecks current membership, preferences, source existence, tags, and item access. */
export async function readEligibleDigestEvents(
  options: EligibilityOptions,
): Promise<{ eligible: EligibleDigestEvent[]; cancelledIds: string[] }> {
  const { executor, memberId } = options;
  const member = await executor
    .selectFrom("members")
    .selectAll()
    .where("id", "=", memberId)
    .executeTakeFirst();
  if (!member || member.status !== "active") {
    return { eligible: [], cancelledIds: [...options.eventIds] };
  }
  const viewer: Viewer = {
    memberId,
    isAdmin: member.role === "admin",
    role: getMemberRoleFromStoredValue(member.role),
    profileComplete: member.profile_completed_at !== null,
    sessionId: "digest",
    visibleRuleIds: await getVisibleRuleIdsFromMemberId({
      database: executor,
      memberId,
    }),
  };
  return _readSources(options, member, viewer);
}
