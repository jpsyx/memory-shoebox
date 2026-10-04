import type { TimezoneImpactDto } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getLocalDayFromInstant } from "../time/localDayHelpers.ts";

/** A moved local day and the capture evidence that must remain unchanged. */
export type TimezoneChangedItem = {
  itemId: string;
  capturedAt: string;
  previousCapturedOn: string;
  capturedOn: string;
  captureSource: string;
  burstId: string | null;
};
/** The shared preview/save plan, computed from the current catalog. */
export type TimezoneChangePlan = {
  impact: TimezoneImpactDto;
  changedItems: TimezoneChangedItem[];
};

async function _readChangedItems(
  options: Readonly<{
    database: DatabaseExecutor;
    toZone: string;
  }>,
): Promise<TimezoneChangedItem[]> {
  const items = await options.database
    .selectFrom("items")
    .select(["id", "captured_at", "captured_on", "capture_source", "burst_id"])
    .where("captured_at_offset_minutes", "is", null)
    .orderBy("id")
    .execute();
  return items.flatMap((item) => {
    const capturedOn = getLocalDayFromInstant({
      instant: item.captured_at,
      timezone: options.toZone,
    });
    return capturedOn === item.captured_on
      ? []
      : [
          {
            itemId: item.id,
            capturedAt: item.captured_at,
            previousCapturedOn: item.captured_on,
            capturedOn,
            captureSource: item.capture_source,
            burstId: item.burst_id,
          },
        ];
  });
}
async function _readBurstEjectionCount(
  options: Readonly<{
    database: DatabaseExecutor;
    changedItems: readonly TimezoneChangedItem[];
  }>,
): Promise<number> {
  const bursts = await options.database
    .selectFrom("bursts")
    .select(["id", "captured_on"])
    .where((eb) => {
      return eb.exists(
        eb
          .selectFrom("items")
          .select("items.id")
          .whereRef("items.burst_id", "=", "bursts.id")
          .where("items.captured_at_offset_minutes", "is", null),
      );
    })
    .execute();
  const days = new Map(
    bursts.map((burst) => {
      return [burst.id, burst.captured_on];
    }),
  );
  return options.changedItems.filter((item) => {
    return (
      item.burstId !== null &&
      days.has(item.burstId) &&
      days.get(item.burstId) !== item.capturedOn
    );
  }).length;
}
async function _readMilestoneMismatches(
  options: Readonly<{
    database: DatabaseExecutor;
    changedItems: readonly TimezoneChangedItem[];
  }>,
): Promise<TimezoneImpactDto["milestoneMismatches"]> {
  if (options.changedItems.length === 0) {
    return [];
  }
  const days = new Map(
    options.changedItems.map((item) => {
      return [item.itemId, item.capturedOn];
    }),
  );
  const joins = await options.database
    .selectFrom("item_milestones")
    .innerJoin("milestones", "milestones.id", "item_milestones.milestone_id")
    .innerJoin("items", "items.id", "item_milestones.item_id")
    .select([
      "item_milestones.item_id",
      "milestones.id",
      "milestones.name",
      "milestones.starts_on",
      "milestones.ends_on",
      "milestones.blurb",
    ])
    .where("items.captured_at_offset_minutes", "is", null)
    .orderBy("milestones.id")
    .execute();
  return _getMismatchesFromJoins({ joins, days });
}
function _getMismatchesFromJoins(
  options: Readonly<{
    joins: Array<{
      item_id: string;
      id: string;
      name: string;
      starts_on: string;
      ends_on: string;
      blurb: string | null;
    }>;
    days: ReadonlyMap<string, string>;
  }>,
): TimezoneImpactDto["milestoneMismatches"] {
  const { joins, days } = options;
  const mismatches = new Map<
    string,
    TimezoneImpactDto["milestoneMismatches"][number]
  >();
  for (const join of joins) {
    const day = days.get(join.item_id);
    if (day === undefined || (day >= join.starts_on && day <= join.ends_on)) {
      continue;
    }
    const mismatch = mismatches.get(join.id) ?? {
      milestone: {
        milestoneId: join.id,
        name: join.name,
        startsOn: join.starts_on,
        endsOn: join.ends_on,
        blurb: join.blurb,
      },
      itemCount: 0,
    };
    mismatch.itemCount += 1;
    mismatches.set(join.id, mismatch);
  }
  return [...mismatches.values()];
}
/**
 * Calculates offset-less local-day, burst and milestone effects without writes.
 */
export async function previewTimezoneChange(
  options: Readonly<{
    database: DatabaseExecutor;
    fromZone: string;
    toZone: string;
  }>,
): Promise<TimezoneChangePlan> {
  const changedItems = await _readChangedItems(options);
  return {
    changedItems,
    impact: {
      fromZone: options.fromZone,
      toZone: options.toZone,
      movingItemCount: changedItems.length,
      burstEjectionItemCount: await _readBurstEjectionCount({
        ...options,
        changedItems,
      }),
      milestoneMismatches: await _readMilestoneMismatches({
        ...options,
        changedItems,
      }),
    },
  };
}
