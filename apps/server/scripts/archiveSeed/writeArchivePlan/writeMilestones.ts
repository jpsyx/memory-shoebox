// apps/server/scripts/archiveSeed/writeArchivePlan/writeMilestones.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import {
  insertItemMilestone,
  insertMilestone,
} from "../../../test/helpers/seedHelpers/archiveSeedHelpers.ts";
import type { ArchivePlan } from "../archivePlan.ts";

/** Writes one occasion and attaches every item captured within its span. */
async function _writeMilestone(options: {
  database: Kysely<Database>;
  milestone: ArchivePlan["milestones"][number];
  uploaderMemberId: string;
}): Promise<void> {
  const { database, milestone, uploaderMemberId } = options;
  const days = [...milestone.days].sort();
  const milestoneId = await insertMilestone(database, {
    name: milestone.name,
    startsOn: days[0] ?? "2026-01-01",
    endsOn: days[days.length - 1] ?? days[0] ?? "2026-01-01",
    blurb: milestone.blurb ?? null,
    created_by: uploaderMemberId,
  });
  const onSpan = await database
    .selectFrom("items")
    .select("id")
    .where("captured_on", "in", days)
    .execute();
  // A loop because each attachment is awaited before the next begins: one
  // SQLite writer, and a `map` over an async function would start them all.
  for (const row of onSpan) {
    await insertItemMilestone(database, { itemId: row.id, milestoneId });
  }
}

/**
 * Writes every occasion in the plan.
 *
 * Must run after the items: each occasion attaches whatever was captured in
 * its span, which it reads back out of `items` rather than out of the plan.
 */
export async function writeMilestones(options: {
  database: Kysely<Database>;
  plan: ArchivePlan;
  uploaderMemberId: string;
}): Promise<void> {
  const { database, plan, uploaderMemberId } = options;
  // A loop because each occasion is written and attached before the next
  // begins: one SQLite writer, and the reads in between would otherwise see
  // a half-written table.
  for (const milestone of plan.milestones) {
    await _writeMilestone({ database, milestone, uploaderMemberId });
  }
}
