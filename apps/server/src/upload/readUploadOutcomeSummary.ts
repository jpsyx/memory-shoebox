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
 * `UploadSessionDetail.summary`: the whole of the `done` state.
 *
 * **Every figure is computed on read**, a `GROUP BY` or a `COUNT` over a few
 * hundred rows, except `notifiedMemberCount`, which is a stored record of
 * what was sent rather than an item count. The caller passes it, and calls
 * this only once `settled_at` is set.
 *
 * Counts are over the session's own rows, and a session is only ever read
 * by its uploader or an admin, both of whom see all of it, so the viewer
 * filter is a no-op here (`upload.md` § GET, Transformations).
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 * @param options.notifiedMemberCount `upload_sessions.notified_member_count`.
 */
export async function readUploadOutcomeSummary(options: {
  database: DatabaseExecutor;
  sessionId: string;
  notifiedMemberCount: number | null;
}): Promise<UploadOutcomeSummary> {
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
    notifiedMemberCount: options.notifiedMemberCount,
  };
}
