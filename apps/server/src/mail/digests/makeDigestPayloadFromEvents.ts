import type {
  DailyDigestEmailPayload,
  EmailCommon,
} from "@memory-shoebox/shared";
import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";
import type { EligibleDigestEvent } from "./readEligibleDigestEvents.ts";

function _commentSection(
  events: readonly EligibleDigestEvent[],
  baseUrl: string,
  category: "comment" | "comment_tag",
): DailyDigestEmailPayload["comments"] {
  const selected = events.filter((entry) => {
    return entry.event.category === category;
  });
  return {
    totalEvents: selected.length,
    entries: selected.slice(0, 20).map((entry) => {
      return {
        sourceId: entry.event.source_id,
        itemId: entry.itemIds[0]!,
        authorDisplayName: entry.authorDisplayName,
        excerpt: Array.from(entry.body).slice(0, 200).join(""),
        url: `${baseUrl}${entry.destination}`,
      };
    }),
  };
}

function _uploadSection(
  events: readonly EligibleDigestEvent[],
  baseUrl: string,
): DailyDigestEmailPayload["uploads"] {
  const uploads = events.filter((entry) => {
    return entry.event.category === "upload";
  });
  return {
    totalEvents: uploads.length,
    totalVisibleItems: uploads.reduce((total, entry) => {
      return total + entry.itemIds.length;
    }, 0),
    entries: uploads.slice(0, 20).map((entry) => {
      return {
        sourceId: entry.event.source_id,
        uploaderDisplayName: entry.authorDisplayName,
        visibleItemCount: entry.itemIds.length,
        url: `${baseUrl}${entry.destination}`,
      };
    }),
  };
}

/** Builds bounded copy while preserving visible totals for every included event. */
export function makeDigestPayloadFromEvents(
  options: Readonly<{
    events: readonly EligibleDigestEvent[];
    window: { sendDate: string; timezone: string };
    baseUrl: string;
  }>,
): Omit<DailyDigestEmailPayload, keyof EmailCommon> {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const events = [...options.events].sort((first, second) => {
    return (
      first.event.occurred_at.localeCompare(second.event.occurred_at) ||
      first.event.id.localeCompare(second.event.id)
    );
  });
  const day = (entry: EligibleDigestEvent) => {
    return getLocalDayFromInstant({
      instant: entry.event.occurred_at,
      timezone: options.window.timezone,
    });
  };
  return {
    periodStart: day(events[0]!),
    periodEnd: day(events.at(-1)!),
    shoeboxUrl: `${baseUrl}/`,
    uploads: _uploadSection(events, baseUrl),
    comments: _commentSection(events, baseUrl, "comment"),
    commentTags: _commentSection(events, baseUrl, "comment_tag"),
  };
}
