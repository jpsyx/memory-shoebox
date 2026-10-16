import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";
import { sortsBeforeFrame, type FrameSortKey } from "./frameSortKey.ts";
import type { BurstFrameRow } from "./readBurstFrameRows.ts";

/**
 * What one aggregate over a burst's **whole** visible sibling set answers.
 *
 * Measured beside the strip and never from it. `burstStripMaxFrames` bounds
 * `ItemDetail.burstFrames` and nothing else: `visibleFrameCount` is the figure
 * that tells the client there are more frames than the strip carries, so a
 * count read off the capped window could never exceed the cap and could never
 * say so. The span and `hasUnseenFrames` are facts about the same set, for the
 * same reason the **stored** span is not used: one is unfiltered, the other
 * would be truncated, and both describe a burst nobody is looking at.
 */
export type BurstFrameTotals = {
  /** Every visible sibling. `BurstSummary.visibleFrameCount`. */
  visibleFrameCount: number;
  /** The true visible span. Undefined only when no sibling is visible. */
  startsAt: string | undefined;
  endsAt: string | undefined;
  /** Any visible sibling with no `item_views` row for this viewer. */
  hasUnseenFrames: boolean;
};

/**
 * The same totals, for a caller that already holds every visible sibling.
 *
 * `readItemSummariesByIds` reads the siblings of every burst a selection
 * touches uncapped, in one `burst_id IN (...)`, so it computes the totals from
 * the rows rather than paying for an aggregate per burst. The permalink cannot:
 * its rows are capped, which is what {@link readBurstFrameTotals} is for.
 *
 * @param rows Every visible sibling of one burst, uncapped.
 */
export function makeBurstFrameTotalsFromRows(
  rows: readonly BurstFrameRow[],
): BurstFrameTotals {
  const capturedAts = rows.map((row) => {
    return row.capturedAt;
  });

  return {
    visibleFrameCount: rows.length,
    startsAt: capturedAts.reduce<string | undefined>(
      (earliestAt, capturedAt) => {
        return earliestAt === undefined || capturedAt < earliestAt
          ? capturedAt
          : earliestAt;
      },
      undefined,
    ),
    endsAt: capturedAts.reduce<string | undefined>((latestAt, capturedAt) => {
      return latestAt === undefined || capturedAt > latestAt
        ? capturedAt
        : latestAt;
    }, undefined),
    hasUnseenFrames: rows.some((row) => {
      return row.isUnseen;
    }),
  };
}

/**
 * One aggregate over every visible sibling of a burst, and where one frame
 * sits in them.
 *
 * **One query, run beside the capped row read rather than derived from it.**
 * Four figures the strip cannot answer once the cap bites: the count, the two
 * span endpoints, whether any visible sibling is unseen, and the frame's own
 * 1-based place in the order. `ItemDetail.burstPosition` is that place and not
 * a position in `burstFrames`, because the contract reads it against
 * `burst.visibleFrameCount`: numbering it over the strip makes it null for a
 * frame past the cap, which is exactly the frame a viewer reaches through
 * `GET /api/bursts/:burstId/frames`.
 *
 * The member predicate belongs in the `ON` clause, as everywhere else in this
 * module: in the `WHERE` the anti-join turns inner and every seen frame drops
 * out of the count as well as out of the flag.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.burstId The burst.
 * @param options.frame The frame whose place comes back as `framePosition`.
 */
export async function readBurstFrameTotals(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  burstId: string;
  frame: FrameSortKey;
}): Promise<{ totals: BurstFrameTotals; framePosition: number }> {
  const row = await applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .where("items.burst_id", "=", options.burstId),
  })
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select((eb) => {
      return [
        eb.fn.countAll<number>().as("visibleFrameCount"),
        eb.fn.min<string | null>("items.captured_at").as("startsAt"),
        eb.fn.max<string | null>("items.captured_at").as("endsAt"),
        eb.fn
          .max<number | null>(
            eb
              .case()
              .when("item_views.item_id", "is", null)
              .then(1)
              .else(0)
              .end(),
          )
          .as("unseenFrameCount"),
        eb.fn
          .sum<number | null>(
            eb
              .case()
              .when(sortsBeforeFrame(options.frame))
              .then(1)
              .else(0)
              .end(),
          )
          .as("precedingFrameCount"),
      ];
    })
    .executeTakeFirstOrThrow();

  return {
    totals: {
      visibleFrameCount: row.visibleFrameCount,
      startsAt: row.startsAt ?? undefined,
      endsAt: row.endsAt ?? undefined,
      hasUnseenFrames: (row.unseenFrameCount ?? 0) > 0,
    },
    framePosition: (row.precedingFrameCount ?? 0) + 1,
  };
}
