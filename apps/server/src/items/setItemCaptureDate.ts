import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";
import {
  setItemCaptureDates,
  type CaptureDateChange,
} from "./setItemCaptureDates.ts";

export type { CaptureDateChange } from "./setItemCaptureDates.ts";

/**
 * Corrects one guarded item's local capture date by hand, using the common
 * clock-preserving batch service with manual history and no milestone attribution.
 */
export async function setItemCaptureDate(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  capturedOn: string;
  capturedTime: string | undefined;
  timezone: string;
  now: string;
}): Promise<CaptureDateChange> {
  const changes = await setItemCaptureDates({
    ...options,
    changes: [
      {
        item: options.item,
        capturedOn: options.capturedOn,
        capturedTime: options.capturedTime,
        reason: "manual",
        milestoneId: null,
      },
    ],
  });
  const change = changes.get(options.item.itemId);
  if (change === undefined) {
    throw new Error("The capture-date batch omitted its requested item.");
  }
  return change;
}
