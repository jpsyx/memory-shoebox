import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import type { VisibleItem } from "../getVisibleItemOr404.ts";
import {
  setItemCaptureDates,
  type CaptureDateChange,
} from "../setItemCaptureDates/setItemCaptureDates.ts";

type SetItemCaptureDateOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  capturedOn: string;
  capturedTime: string | undefined;
  timezone: string;
  now: string;
};

export type { CaptureDateChange } from "../setItemCaptureDates/setItemCaptureDates.ts";

/** Corrects one guarded item's local date and returns its resulting capture. */
export async function setItemCaptureDate(
  options: Readonly<SetItemCaptureDateOptions>,
): Promise<CaptureDateChange> {
  const changes = await setItemCaptureDates({
    ...options,
    changes: [
      {
        item: options.item,
        capturedOn: options.capturedOn,
        capturedTime: options.capturedTime,
        reason: "manual",
        milestoneId: undefined,
      },
    ],
  });
  const change = changes.get(options.item.itemId);
  if (change === undefined) {
    throw new Error("The capture-date batch omitted its requested item.");
  }
  return change;
}
