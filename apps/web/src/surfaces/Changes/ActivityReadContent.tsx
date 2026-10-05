import type { ActivityEntryDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { PresenceReadState } from "@/surfaces/Presence/PresenceReadState";
import { ActivityDays } from "./ActivityDays/ActivityDays";

type Props = {
  hasData: boolean;
  isPending: boolean;
  hasFilters: boolean;
  entries: readonly ActivityEntryDto[];
  timezone: string;
  onRetry: () => void;
};
/**
 * Initial failures, empty histories and filters without matches are distinct
 * states.
 */
export function ActivityReadContent({
  hasData,
  isPending,
  hasFilters,
  entries,
  timezone,
  onRetry,
}: Readonly<Props>): ReactNode {
  if (!hasData) {
    return (
      <PresenceReadState
        label="changes"
        isPending={isPending}
        onRetry={onRetry}
      />
    );
  }
  return entries.length === 0 ? (
    <Prose>
      {hasFilters
        ? "No changes match these filters."
        : "Nothing has been changed yet."}
    </Prose>
  ) : (
    <ActivityDays entries={entries} timezone={timezone} />
  );
}
