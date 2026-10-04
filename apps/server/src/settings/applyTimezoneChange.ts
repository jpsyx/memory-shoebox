import { sql } from "kysely";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ejectCaptureDateBurstFrames } from "../items/setItemCaptureDates/ejectCaptureDateBurstFrames.ts";
import type { TimezoneChangePlan } from "./previewTimezoneChange.ts";

type ApplyTimezoneChangeOptions = {
  transaction: DatabaseExecutor;
  plan: TimezoneChangePlan;
  memberId: string;
  now: string;
};
async function _writeMovedDays(
  options: Readonly<ApplyTimezoneChangeOptions>,
): Promise<void> {
  const { changedItems } = options.plan;
  await options.transaction
    .updateTable("items")
    .set({
      captured_on: sql<string>`case id ${sql.join(
        changedItems.map((item) => {
          return sql`when ${item.itemId} then ${item.capturedOn}`;
        }),
        sql` `,
      )} end`,
    })
    .where(
      "id",
      "in",
      changedItems.map((item) => {
        return item.itemId;
      }),
    )
    .execute();
  await _writeCaptureHistory(options);
}
async function _writeCaptureHistory(
  options: Readonly<ApplyTimezoneChangeOptions>,
): Promise<void> {
  const { changedItems } = options.plan;
  await options.transaction
    .insertInto("item_capture_date_changes")
    .values(
      changedItems.map((item) => {
        return {
          id: createId(),
          item_id: item.itemId,
          milestone_id: null,
          previous_captured_at: item.capturedAt,
          previous_capture_date: item.previousCapturedOn,
          previous_capture_source: item.captureSource,
          new_captured_at: item.capturedAt,
          new_capture_date: item.capturedOn,
          changed_by: options.memberId,
          changed_at: options.now,
          reason: "timezone_change",
        };
      }),
    )
    .execute();
}
async function _clearExcludedAcknowledgements(
  options: Readonly<ApplyTimezoneChangeOptions>,
): Promise<void> {
  await options.transaction
    .updateTable("item_milestones")
    .set({ span_mismatch_acknowledged_at: null })
    .where(
      "item_id",
      "in",
      options.plan.changedItems.map((item) => {
        return item.itemId;
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
 * Applies a locked plan while preserving capture and file evidence.
 */
async function _applyTimezoneBatch(
  options: Readonly<ApplyTimezoneChangeOptions>,
): Promise<void> {
  if (options.plan.changedItems.length === 0) {
    return;
  }
  await _writeMovedDays(options);
  await ejectCaptureDateBurstFrames({
    database: options.transaction,
    frames: options.plan.changedItems.map((item) => {
      return {
        itemId: item.itemId,
        burstId: item.burstId ?? undefined,
        capturedOn: item.capturedOn,
      };
    }),
  });
  await _clearExcludedAcknowledgements(options);
}

/** Applies all bounded write batches inside the caller's one transaction. */
export async function applyTimezoneChange(
  options: Readonly<ApplyTimezoneChangeOptions>,
): Promise<void> {
  const batchSize = 100;
  for (
    let batchStart = 0;
    batchStart < options.plan.changedItems.length;
    batchStart += batchSize
  ) {
    await _applyTimezoneBatch({
      ...options,
      plan: {
        ...options.plan,
        changedItems: options.plan.changedItems.slice(
          batchStart,
          batchStart + batchSize,
        ),
      },
    });
  }
}
