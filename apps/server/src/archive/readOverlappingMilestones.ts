import type { MilestoneRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Query 2 of a timeline page: the occasions covering the window.
 *
 * Tens of rows, on `INDEX (starts_on, ends_on)`. Spans are expanded in the
 * application and never materialised, because a `days` table is exactly what
 * `data-models.md` § `items` refuses: a day is `GROUP BY captured_on`, and the
 * one cost of that is this query.
 *
 * **A milestone has no visibility of its own** (Decision 5), so no predicate
 * appears here: the occasion and its name are visible to everybody and only
 * its photographs are restricted.
 *
 * @param options.database The Kysely handle.
 * @param options.fromDay The selection's inclusive lower date, if any.
 * @param options.untilDay The selection's inclusive upper date, if any.
 * @param options.beforeDay The cursor's day. Nothing at or after it can show.
 * @param options.sinceDay The window's floor, below which no day can reach
 *   this page.
 */
export async function readOverlappingMilestones(options: {
  database: DatabaseExecutor;
  fromDay: string | undefined;
  untilDay: string | undefined;
  beforeDay: string | undefined;
  sinceDay: string | undefined;
}): Promise<MilestoneRef[]> {
  const all = options.database
    .selectFrom("milestones")
    .select([
      "milestones.id as milestoneId",
      "milestones.name as name",
      "milestones.starts_on as startsOn",
      "milestones.ends_on as endsOn",
      "milestones.blurb as blurb",
    ])
    .orderBy("milestones.starts_on", "asc");

  const beforeBounded =
    options.beforeDay === undefined
      ? all
      : all.where("milestones.starts_on", "<", options.beforeDay);
  const sinceBounded =
    options.sinceDay === undefined
      ? beforeBounded
      : beforeBounded.where("milestones.ends_on", ">=", options.sinceDay);
  const untilBounded =
    options.untilDay === undefined
      ? sinceBounded
      : sinceBounded.where("milestones.starts_on", "<=", options.untilDay);
  const fromBounded =
    options.fromDay === undefined
      ? untilBounded
      : untilBounded.where("milestones.ends_on", ">=", options.fromDay);

  return fromBounded.execute();
}
