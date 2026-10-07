import type { VideoReaction } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { VideoReactionsTable } from "../db/types/moderation.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";

/** Rejects gestures without a known video runtime and clamps the upper bound. */
export function getVideoMomentFromItem(
  options: Readonly<{
    item: VisibleItem;
    atSeconds: number;
  }>,
): number {
  if (options.item.kind !== "video" || options.item.durationMs === null) {
    throw ApiError.invalidRequest({
      atSeconds: ["A reaction needs a video with a known duration."],
    });
  }
  return Math.min(options.atSeconds, options.item.durationMs / 1000);
}

/** Maps stored video gestures to their authors and removal permissions. */
export async function makeVideoReactionsFromRows(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    rows: readonly VideoReactionsTable[];
  }>,
): Promise<VideoReaction[]> {
  const members = await readMemberRefs(options.database);
  return options.rows.map((row) => {
    return {
      reactionId: row.id,
      author: members.get(row.member_id) ?? {
        memberId: row.member_id,
        displayName: "",
      },
      emoji: row.emoji,
      atSeconds: row.at_seconds,
      createdAt: row.created_at,
      canDelete:
        row.member_id === options.viewer.memberId || options.viewer.isAdmin,
    };
  });
}

/** An immutable insert: an existing ID only accepts the identical event. */
export async function putVideoReaction(
  options: Readonly<{
    database: DatabaseExecutor;
    event: VideoReactionsTable;
  }>,
): Promise<VideoReactionsTable> {
  await options.database
    .insertInto("video_reactions")
    .values(options.event)
    .onConflict((conflict) => {
      return conflict.column("id").doNothing();
    })
    .execute();
  const stored = await options.database
    .selectFrom("video_reactions")
    .selectAll()
    .where("id", "=", options.event.id)
    .executeTakeFirstOrThrow();
  if (
    stored.item_id !== options.event.item_id ||
    stored.member_id !== options.event.member_id ||
    stored.emoji !== options.event.emoji ||
    stored.at_seconds !== options.event.at_seconds
  ) {
    throw ApiError.conflict({ code: "video_reaction_conflict" });
  }
  return stored;
}
