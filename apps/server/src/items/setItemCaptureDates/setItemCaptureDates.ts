import { ejectCaptureDateBurstFrames } from "./ejectCaptureDateBurstFrames.ts";
import { sql, type RawBuilder } from "kysely";
import { createId } from "../../db/createId.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import {
  getLocalWallClockFromInstant,
  makeInstantFromLocalWallClock,
} from "../../time/wallClockHelpers.ts";
import type { VisibleItem } from "../getVisibleItemOr404.ts";
/** What a correction landed on, including unchanged results. */
export type CaptureDateChange = {
  capturedAt: string;
  capturedOn: string;
  captureSource: VisibleItem["captureSource"];
  burstId: string | undefined;
  burstIndex: number | undefined;
  didChange: boolean;
};
/** A guarded item and the desired local date, clock, and audit attribution. */
export type CaptureDateTarget = {
  item: VisibleItem;
  capturedOn: string;
  capturedTime: string | undefined;
  reason: "manual" | "milestone_reconcile";
  milestoneId: string | undefined;
};
type BatchOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  changes: readonly CaptureDateTarget[];
  timezone: string;
  now: string;
};
type PlannedChange = CaptureDateTarget & {
  change: CaptureDateChange;
};
function _makeUnchangedCaptureChangeFromItem(
  item: Readonly<VisibleItem>,
): CaptureDateChange {
  return {
    capturedAt: item.capturedAt,
    capturedOn: item.capturedOn,
    captureSource: item.captureSource,
    burstId: item.burstId ?? undefined,
    burstIndex: item.burstIndex ?? undefined,
    didChange: false,
  };
}
function _makePlanFromTarget(
  options: Readonly<{
    target: Readonly<CaptureDateTarget>;
    timezone: string;
  }>,
): PlannedChange {
  const { target, timezone } = options;
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
      burstId: item.burstId ?? undefined,
      burstIndex: item.burstIndex ?? undefined,
      didChange,
    },
  };
}
function _makeColumnCaseFromPlans(
  options: Readonly<{
    plans: readonly PlannedChange[];
    column: "capturedAt" | "capturedOn";
  }>,
): RawBuilder<string> {
  const { plans, column } = options;
  return sql<string>`case id ${sql.join(
    plans.map((plan) => {
      return sql`when ${plan.item.itemId} then ${plan.change[column]}`;
    }),
    sql` `,
  )} end`;
}
type WriteItemChangesOptions = {
  readOptions: Readonly<BatchOptions>;
  plans: readonly PlannedChange[];
};
async function _writeCaptureHistory(
  options: Readonly<WriteItemChangesOptions>,
): Promise<void> {
  const { readOptions, plans } = options;
  await readOptions.transaction
    .insertInto("item_capture_date_changes")
    .values(
      plans.map((plan) => {
        return {
          id: createId(),
          item_id: plan.item.itemId,
          milestone_id: plan.milestoneId ?? null,
          previous_captured_at: plan.item.capturedAt,
          previous_capture_date: plan.item.capturedOn,
          previous_capture_source: plan.item.captureSource,
          new_captured_at: plan.change.capturedAt,
          new_capture_date: plan.change.capturedOn,
          changed_by: readOptions.viewer.memberId,
          changed_at: readOptions.now,
          reason: plan.reason,
        };
      }),
    )
    .execute();
}
async function _writeItemChanges(
  options: Readonly<WriteItemChangesOptions>,
): Promise<void> {
  const { readOptions, plans } = options;
  await readOptions.transaction
    .updateTable("items")
    .set({
      captured_at: _makeColumnCaseFromPlans({
        plans,
        column: "capturedAt",
      }),
      captured_on: _makeColumnCaseFromPlans({
        plans,
        column: "capturedOn",
      }),
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
  await _writeCaptureHistory({ readOptions, plans });
}
async function _clearExcludedAcknowledgements(
  options: Readonly<{
    database: DatabaseExecutor;
    plans: readonly PlannedChange[];
  }>,
): Promise<void> {
  const { database, plans } = options;
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
async function _applyChangedPlans(
  options: Readonly<{
    readOptions: Readonly<BatchOptions>;
    plans: readonly PlannedChange[];
  }>,
): Promise<Set<string>> {
  const { readOptions, plans: changed } = options;
  await _writeItemChanges({
    readOptions,
    plans: changed,
  });
  const ejected = await ejectCaptureDateBurstFrames({
    database: readOptions.transaction,
    frames: changed.map((plan) => {
      return {
        itemId: plan.item.itemId,
        burstId: plan.item.burstId ?? undefined,
        capturedOn: plan.change.capturedOn,
      };
    }),
  });
  await _clearExcludedAcknowledgements({
    database: readOptions.transaction,
    plans: changed,
  });
  return ejected;
}

/**
 * Plans all clocks before writing, then applies changes, audit, burst ejection,
 * and acknowledgement clearing in fixed queries in the caller's transaction.
 * Original instants and stored offsets are never overwritten. No-ops write
 * nothing.
 */
export async function setItemCaptureDates(
  options: Readonly<BatchOptions>,
): Promise<Map<string, CaptureDateChange>> {
  const plans = options.changes.map((target) => {
    return _makePlanFromTarget({
      target,
      timezone: options.timezone,
    });
  });
  const changed = plans.filter((plan) => {
    return plan.change.didChange;
  });
  const ejected =
    changed.length > 0
      ? await _applyChangedPlans({ readOptions: options, plans: changed })
      : new Set<string>();
  return new Map(
    plans.map((plan) => {
      return [
        plan.item.itemId,
        ejected.has(plan.item.itemId)
          ? { ...plan.change, burstId: undefined, burstIndex: undefined }
          : plan.change,
      ];
    }),
  );
}
