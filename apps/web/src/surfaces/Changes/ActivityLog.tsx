import { Stack } from "@mantine/core";
import type { ActivityRequest } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { useActivityLog } from "./useActivityLog";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { ActivityFilters } from "./ActivityFilters";
import { ActivityReadContent } from "./ActivityReadContent";
import { ActivityPaging } from "./ActivityPaging";
import { activityFamilyLabel } from "./activityFamilyLabel";

/** Accumulates cursor pages, preserving earlier rows when an older page fails. */
export function ActivityLog(
  options: Readonly<{
    filters: Omit<ActivityRequest, "cursor" | "limit">;
    timezone: string;
  }>,
): ReactNode {
  const { query, entries, hasFilters } = useActivityLog(options.filters);
  const title =
    options.filters.family === undefined
      ? "Everything, newest first"
      : activityFamilyLabel(options.filters.family);
  return (
    <>
      <ActivityFilters filters={options.filters} entries={entries} />
      <Sheet wide label="What has been changed">
        <SheetHead title={title} />
        <Stack gap="md">
          <Prose>
            Times are this Shoebox's own ({options.timezone}). Names and device
            labels are historical snapshots, including when their records no
            longer exist.
          </Prose>
          <ActivityReadContent
            hasData={query.data !== undefined}
            isPending={query.isPending}
            hasFilters={hasFilters}
            entries={entries}
            timezone={options.timezone}
            onRetry={() => {
              void query.refetch();
            }}
          />
          <ActivityPaging
            hasNextPage={query.hasNextPage}
            isFetching={query.isFetchingNextPage}
            hasFailed={query.isFetchNextPageError}
            onLoad={() => {
              void query.fetchNextPage();
            }}
          />
        </Stack>
      </Sheet>
    </>
  );
}
