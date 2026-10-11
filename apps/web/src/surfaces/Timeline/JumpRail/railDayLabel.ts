import type { RailDay } from "@memory-shoebox/shared";
import { dayNumberLabel, monthLabel } from "@/system/labelHelpers/labelHelpers";

/** The jump date and its complete, viewer-visible counts by media type. */
export function railDayLabel(day: Readonly<RailDay>): string {
  const date = `${dayNumberLabel(day.capturedOn)} ${monthLabel(day.capturedOn).slice(0, 3).toLowerCase()}`;
  const photos = `${day.photoCount} ${day.photoCount === 1 ? "photo" : "photos"}`;
  const videos = `${day.videoCount} ${day.videoCount === 1 ? "video" : "videos"}`;
  return `${date} · ${photos} · ${videos}`;
}
