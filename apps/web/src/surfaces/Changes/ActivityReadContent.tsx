import type { ActivityEntryDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { PresenceReadState } from "@/surfaces/Presence/PresenceReadState";
import { ActivityDays } from "./ActivityDays";

type Props = {
  hasData: boolean;
  isPending: boolean;
  hasFilters: boolean;
  entries: readonly ActivityEntryDto[];
  timezone: string;
  onRetry: () => void;
};
/** Initial failures, empty histories and filters without matches are distinct states. */
export function ActivityReadContent(options: Readonly<Props>): ReactNode {
  if (!options.hasData)
    return (
      <PresenceReadState
        label="changes"
        isPending={options.isPending}
        onRetry={options.onRetry}
      />
    );
  return options.entries.length === 0 ? (
    <Prose>
      {options.hasFilters
        ? "No changes match these filters."
        : "Nothing has been changed yet."}
    </Prose>
  ) : (
    <ActivityDays entries={options.entries} timezone={options.timezone} />
  );
}
