import type { ItemDetail, MediaPositionResponse } from "@memory-shoebox/shared";
import {
  getWallClockFromCapture,
  timeOfDayLabel,
} from "@/system/labelHelpers/labelHelpers";
import { itemHeading } from "../itemCopyHelpers/itemCopyHelpers";

/** The existing item heading with camera-local capture and optional position. */
export function theaterTitleLabel({
  detail,
  timezone,
  position,
}: Readonly<{
  detail: ItemDetail;
  timezone: string;
  position: MediaPositionResponse | undefined;
}>): string {
  const wallClock = getWallClockFromCapture({
    capturedAt: detail.capturedAt,
    offsetMinutes: detail.capturedAtOffsetMinutes ?? undefined,
    timezone,
  });
  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${wallClock.date}T00:00:00Z`));
  const segments = [itemHeading(detail), date, timeOfDayLabel(wallClock.time)];
  return [
    ...segments,
    ...(position == null ? [] : [`${position.position}/${position.total}`]),
  ].join(" · ");
}
