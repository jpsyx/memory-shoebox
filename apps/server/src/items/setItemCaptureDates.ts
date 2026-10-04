import { ejectCaptureDateBurstFrames } from "./ejectCaptureDateBurstFrames.ts";
import { sql, type RawBuilder } from "kysely";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getLocalWallClockFromInstant,
  makeInstantFromLocalWallClock,
} from "../time/wallClockHelpers.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";

/** What a correction landed on, including unchanged results. */
export type CaptureDateChange = {
  capturedAt: string;
  capturedOn: string;
  captureSource: VisibleItem["captureSource"];
  burstId: string | null;
  burstIndex: number | null;
  didChange: boolean;
};

/** A guarded item and the desired local date, clock, and audit attribution. */
export type CaptureDateTarget = {
  item: VisibleItem;
  capturedOn: string;
  capturedTime: string | undefined;
  reason: "manual" | "milestone_reconcile";
  milestoneId: string | null;
};

type BatchOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  changes: readonly CaptureDateTarget[];
  timezone: string;
  now: string;
};
type PlannedChange = CaptureDateTarget & { change: CaptureDateChange };

function _makeUnchangedCaptureChangeFromItem(
  item: Readonly<VisibleItem>,
): CaptureDateChange {
  return {
    capturedAt: item.capturedAt,
    capturedOn: item.capturedOn,
    captureSource: item.captureSource,
    burstId: item.burstId,
    burstIndex: item.burstIndex,
    didChange: false,
  };
}

function _makePlanFromTarget(
  target: Readonly<CaptureDateTarget>,
  timezone: string,
): PlannedChange {
  const { item } = target;
  if (
    target.capturedOn === item.capturedOn &&
    target.capturedTime === undefined
  ) {
    return {
      ...target,
      change: _makeUnchangedCaptureChangeFromItem(item),
    };
  }
  const localTime =
    target.capturedTime ??
    getLocalWallClockFromInstant({
      instant: item.capturedAt,
      offsetMinutes: item.capturedAtOffsetMinutes,
      timezone,
    });
  const capturedAt = makeInstantFromLocalWallClock({
    localDate: target.capturedOn,
    localTime,
    offsetMinutes: item.capturedAtOffsetMinutes,
    timezone,
  });
  const didChange =
    capturedAt !== item.capturedAt || target.capturedOn !== item.capturedOn;
  return {
    ...target,
    change: {
      capturedAt,
      capturedOn: target.capturedOn,
      captureSource: didChange ? "uploader_set" : item.captureSource,
      burstId: item.burstId,
      burstIndex: item.burstIndex,
      didChange,
    },
  };
}

function _makeColumnCaseFromPlans(
  plans: readonly PlannedChange[],
  column: "capturedAt" | "capturedOn",
): RawBuilder<string> {
  return sql<string>`case id ${sql.join(
    plans.map((plan) => {
      return sql`when ${plan.item.itemId} then ${plan.change[column]}`;
    }),
    sql` `,
  )} end`;
}

async function _writeItemChanges(
  options: Readonly<BatchOptions>,
  plans: readonly PlannedChange[],
): Promise<void> {
  await options.transaction
    .updateTable("items")
    .set({
      captured_at: _makeColumnCaseFromPlans(plans, "capturedAt"),
      captured_on: _makeColumnCaseFromPlans(plans, "capturedOn"),
      capture_source: "uploader_set",
    })
    .where(
      "id",
      "in",
      plans.map((plan) => {
        return plan.item.itemId;
      }),
    )
    .execute();
  await options.transaction
    .insertInto("item_capture_date_changes")
    .values(
      plans.map((plan) => {
        return {
          id: createId(),
          item_id: plan.item.itemId,
          milestone_id: plan.milestoneId,
          previous_captured_at: plan.item.capturedAt,
          previous_capture_date: plan.item.capturedOn,
          previous_capture_source: plan.item.captureSource,
          new_captured_at: plan.change.capturedAt,
          new_capture_date: plan.change.capturedOn,
          changed_by: options.viewer.memberId,
          changed_at: options.now,
          reason: plan.reason,
        };
      }),
    )
    .execute();
}

async function _clearExcludedAcknowledgements(
  database: DatabaseExecutor,
  plans: readonly PlannedChange[],
): Promise<void> {
  await database
    .updateTable("item_milestones")
    .set({ span_mismatch_acknowledged_at: null })
    .where(
      "item_id",
      "in",
      plans.map((plan) => {
        return plan.item.itemId;
      }),
    )
    .where((eb) => {
      return eb.exists(
        eb
          .selectFrom("milestones")
          .innerJoin("items", "items.id", "item_milestones.item_id")
          .select("milestones.id")
          .whereRef("milestones.id", "=", "item_milestones.milestone_id")
          .where((inner) => {
            return inner.or([
              inner(
                "milestones.starts_on",
                ">",
                inner.ref("items.captured_on"),
              ),
              inner("milestones.ends_on", "<", inner.ref("items.captured_on")),
            ]);
          }),
      );
    })
    .execute();
}

/**
 * Plans all clocks before writing, then applies changes, audit, burst ejection,
 * and acknowledgement clearing in fixed queries in the caller's transaction.
 * Original instants and stored offsets are never overwritten. No-ops write nothing.
 */
export async function setItemCaptureDates(
  options: Readonly<BatchOptions>,
): Promise<Map<string, CaptureDateChange>> {
  const plans = options.changes.map((target) => {
    return _makePlanFromTarget(target, options.timezone);
  });
  const changed = plans.filter((plan) => {
    return plan.change.didChange;
  });
  if (changed.length > 0) {
    await _writeItemChanges(options, changed);
    const ejected = await ejectCaptureDateBurstFrames({
      database: options.transaction,
      frames: changed.map((plan) => {
        return {
          itemId: plan.item.itemId,
          burstId: plan.item.burstId,
          capturedOn: plan.change.capturedOn,
        };
      }),
    });
    changed.forEach((plan) => {
      if (ejected.has(plan.item.itemId)) {
        plan.change.burstId = null;
        plan.change.burstIndex = null;
      }
    });
    await _clearExcludedAcknowledgements(options.transaction, changed);
  }
  return new Map(
    plans.map((plan) => {
      return [plan.item.itemId, plan.change];
    }),
  );
}
