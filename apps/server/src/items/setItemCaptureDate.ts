import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getLocalWallClockFromInstant,
  makeInstantFromLocalWallClock,
} from "../time/wallClockHelpers.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";

/** What the correction landed on, for the response to recompose from. */
export type CaptureDateChange = {
  capturedAt: string;
  capturedOn: string;
  /** `'uploader_set'` after a move, and untouched after a no-op. */
  captureSource: string;
  burstId: string | null;
  burstIndex: number | null;
  /** False when the requested instant was the one already stored. */
  didChange: boolean;
};

/** The move itself: the item's own columns and the row that records them. */
async function _writeTheMove(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  capturedAt: string;
  capturedOn: string;
  now: string;
}): Promise<void> {
  // `captured_on` comes from the new local date and never from
  // `date(captured_at)` in UTC, which would put a 23:30 local photograph on
  // the wrong day and therefore under the wrong milestone.
  await options.transaction
    .updateTable("items")
    .set({
      captured_at: options.capturedAt,
      captured_on: options.capturedOn,
      capture_source: "uploader_set",
    })
    .where("id", "=", options.item.itemId)
    .execute();

  await options.transaction
    .insertInto("item_capture_date_changes")
    .values({
      id: createId(),
      item_id: options.item.itemId,
      // Null: this path is the hand correction, not a reconciliation.
      milestone_id: null,
      previous_captured_at: options.item.capturedAt,
      previous_capture_date: options.item.capturedOn,
      previous_capture_source: options.item.captureSource,
      new_captured_at: options.capturedAt,
      new_capture_date: options.capturedOn,
      changed_by: options.viewer.memberId,
      changed_at: options.now,
      reason: "manual",
    })
    .execute();
}

/**
 * Takes the item out of a burst whose day it no longer shares.
 *
 * A burst is a same-day run by definition, so a frame moved to another day is
 * not part of it. The other forty-four stay exactly where they are, and the
 * foreign key nulls `cover_item_id` if this frame was the cover.
 *
 * @returns Whether it left a burst.
 */
async function _ejectFromBurstIfItLeftItsDay(options: {
  transaction: DatabaseExecutor;
  item: VisibleItem;
  capturedOn: string;
}): Promise<boolean> {
  const { burstId } = options.item;
  if (burstId === null) {
    return false;
  }

  const burst = await options.transaction
    .selectFrom("bursts")
    .select("bursts.captured_on as capturedOn")
    .where("bursts.id", "=", burstId)
    .executeTakeFirst();

  if (burst === undefined || burst.capturedOn === options.capturedOn) {
    return false;
  }

  await options.transaction
    .updateTable("items")
    .set({ burst_id: null, burst_index: null })
    .where("id", "=", options.item.itemId)
    .execute();

  const remaining = await options.transaction
    .selectFrom("items")
    .select("items.id as itemId")
    .where("items.burst_id", "=", burstId)
    .limit(1)
    .executeTakeFirst();

  if (remaining === undefined) {
    // No foreign key direction does this. One remaining frame does NOT drop
    // the burst: it renders as a plain print, which is a read-time rule.
    await options.transaction
      .deleteFrom("bursts")
      .where("id", "=", burstId)
      .execute();
  }

  return true;
}

/**
 * Offers the existing reconciliation again on every span it just left.
 *
 * Clearing the acknowledgement is what stops a considered "Leave them as they
 * are" silently outliving the fact it was a decision about. Rows whose span
 * still contains the item are left alone, and nothing is attached or detached
 * either way: the offer itself is slice G's.
 */
async function _rearmSpansThatNoLongerContainIt(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  capturedOn: string;
}): Promise<void> {
  await options.transaction
    .updateTable("item_milestones")
    .set({ span_mismatch_acknowledged_at: null })
    .where("item_id", "=", options.itemId)
    .where((eb) => {
      return eb.exists(
        eb
          .selectFrom("milestones")
          .select("milestones.id")
          .whereRef("milestones.id", "=", "item_milestones.milestone_id")
          .where((inner) => {
            return inner.or([
              inner("milestones.starts_on", ">", options.capturedOn),
              inner("milestones.ends_on", "<", options.capturedOn),
            ]);
          }),
      );
    })
    .execute();
}

/**
 * Corrects one item's capture date by hand.
 *
 * **It destroys a fact the file carried**, which is why every step below is a
 * consequence somebody has to be able to undo:
 * `item_capture_date_changes` holds both sides of the move, one row per moved
 * item, and `items.original_captured_at` is never written by any path, so
 * "revert to what the file said" stays one step away however many times the
 * date is moved (Decision 10).
 *
 * Two columns take different values and are not interchangeable
 * (`items.md` Ruling 2): `items.capture_source` records **how** the date was
 * arrived at and has no `'manual'` member, so it becomes `'uploader_set'`,
 * while `item_capture_date_changes.reason` records **why** and is `'manual'`.
 *
 * Three consequences follow, in this order, in the caller's transaction:
 * the item leaves a burst whose day it no longer shares, that burst is dropped
 * if the departure emptied it, and every attached milestone whose span no
 * longer contains the item has its acknowledgement cleared so the **existing**
 * reconciliation is offered again rather than a new one being invented.
 *
 * **Nothing is attached or detached here.** An item may be attached to a
 * milestone whose span does not contain it, and that is allowed: the
 * reconciliation offer is slice G's.
 *
 * @param options.transaction The caller's transaction.
 * @param options.viewer Who is correcting it.
 * @param options.item The item, already resolved and guarded.
 * @param options.capturedOn The new local day.
 * @param options.capturedTime A replacement wall clock, or null to keep it.
 * @param options.timezone The `shoebox.timezone` setting.
 * @param options.now The instant the change row carries.
 */
export async function setItemCaptureDate(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  capturedOn: string;
  capturedTime: string | null;
  timezone: string;
  now: string;
}): Promise<CaptureDateChange> {
  const { item } = options;

  // The clock the photograph was taken at, kept unless a new one was typed:
  // a 06:41 photograph becomes 06:41 on the new day and no fact is invented.
  const localTime =
    options.capturedTime ??
    getLocalWallClockFromInstant({
      instant: item.capturedAt,
      offsetMinutes: item.capturedAtOffsetMinutes,
      timezone: options.timezone,
    });

  // The item's own offset is carried across unchanged: moving a photograph to
  // another day does not move the camera to another country.
  const capturedAt = makeInstantFromLocalWallClock({
    localDate: options.capturedOn,
    localTime,
    offsetMinutes: item.capturedAtOffsetMinutes,
    timezone: options.timezone,
  });

  if (
    capturedAt === item.capturedAt &&
    options.capturedOn === item.capturedOn
  ) {
    // A no-op is not a correction: no write, no change row, no audit row.
    return {
      capturedAt: item.capturedAt,
      capturedOn: item.capturedOn,
      captureSource: item.captureSource,
      burstId: item.burstId,
      burstIndex: item.burstIndex,
      didChange: false,
    };
  }

  await _writeTheMove({ ...options, item, capturedAt });
  const leavesBurst = await _ejectFromBurstIfItLeftItsDay({
    transaction: options.transaction,
    item,
    capturedOn: options.capturedOn,
  });
  await _rearmSpansThatNoLongerContainIt({
    transaction: options.transaction,
    itemId: item.itemId,
    capturedOn: options.capturedOn,
  });

  return {
    capturedAt,
    capturedOn: options.capturedOn,
    captureSource: "uploader_set",
    burstId: leavesBurst ? null : item.burstId,
    burstIndex: leavesBurst ? null : item.burstIndex,
    didChange: true,
  };
}
