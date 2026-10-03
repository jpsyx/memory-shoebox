import type { UploadOutcomeSummary } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** `COUNT(*) WHERE state = 'done'` over this session's files. */
async function _readDoneFileCount(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<number> {
  const row = await options.database
    .selectFrom("upload_files")
    .select((eb) => {
      return eb.fn.countAll<number>().as("itemCount");
    })
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .where("upload_files.state", "=", "done")
    .executeTakeFirstOrThrow();
  return Number(row.itemCount);
}

/** `COUNT(DISTINCT captured_on)` over this session's items. */
async function _readDayCount(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<number> {
  const row = await options.database
    .selectFrom("items")
    .select((eb) => {
      return eb.fn.count<number>("items.captured_on").distinct().as("dayCount");
    })
    .where("items.upload_session_id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  return Number(row.dayCount);
}

/** `COUNT(DISTINCT milestone_id)` over `item_milestones` joined to them. */
async function _readMilestoneCount(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<number> {
  const row = await options.database
    .selectFrom("item_milestones")
    .innerJoin("items", "items.id", "item_milestones.item_id")
    .select((eb) => {
      return eb.fn
        .count<number>("item_milestones.milestone_id")
        .distinct()
        .as("milestoneCount");
    })
    .where("items.upload_session_id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  return Number(row.milestoneCount);
}

/** The session's bursts and the frames in them, in one aggregate. */
async function _readBurstCounts(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<{ burstCount: number; burstFrameCount: number }> {
  const row = await options.database
    .selectFrom("bursts")
    .leftJoin("items", "items.burst_id", "bursts.id")
    .select((eb) => {
      return [
        eb.fn.count<number>("bursts.id").distinct().as("burstCount"),
        eb.fn.count<number>("items.id").as("burstFrameCount"),
      ];
    })
    .where("bursts.upload_session_id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  return {
    burstCount: Number(row.burstCount),
    burstFrameCount: Number(row.burstFrameCount),
  };
}

/**
 * Returns the settled batch summary with current item figures and the recorded
 * notification count.
 *
 * notifiedMemberCount records what mail was sent, not the current item count.
 * The caller supplies it and calls only once settled_at is set.
 *
 * Counts cover the session's own rows. Its uploader and admins see all of them,
 * so no viewer filter applies.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 * @param options.notifiedMemberCount `upload_sessions.notified_member_count`.
 */
export async function readUploadOutcomeSummary(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
    notifiedMemberCount: number | undefined;
  }>,
): Promise<UploadOutcomeSummary> {
  // Aggregate the item figures on read rather than storing mutable counters.

  const [itemCount, dayCount, milestoneCount, bursts] = await Promise.all([
    _readDoneFileCount(options),
    _readDayCount(options),
    _readMilestoneCount(options),
    _readBurstCounts(options),
  ]);
  return {
    itemCount,
    dayCount,
    milestoneCount,
    ...bursts,
    notifiedMemberCount: options.notifiedMemberCount ?? null,
  };
}
