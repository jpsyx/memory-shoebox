import { Button, Stack } from "@mantine/core";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeTimelineQueryOptionsFromView } from "@/api/timeline/timeline";
import { getViewFromSearch } from "@/api/timeline/selection/selection";
import { Prose } from "@/system/typography/Prose";
import { useMemberReadAuthority } from "@/surfaces/Members/useMemberReadAuthority";
import { ArrangementPrints } from "@/surfaces/Settings/SettingsArrangement/ArrangementPrints";
import classes from "@/surfaces/Settings/SettingsArrangement/ArrangementPreview/ArrangementPreview.module.css";
type Props = { arrangement: "tidy" | "messy" };

/** Reads only visible timeline prints for a small, live arrangement preview. */
export function ArrangementPreview({
  arrangement,
}: Readonly<Props>): ReactNode {
  const timeline = useInfiniteQuery(
    makeTimelineQueryOptionsFromView({ view: getViewFromSearch({}) }),
  );
  const items =
    timeline.data?.pages
      .flatMap((page) => {
        return page.days.flatMap((day) => {
          return day.items;
        });
      })
      .slice(0, 8) ?? [];
  useMemberReadAuthority(timeline.error ?? undefined);
  return (
    <div
      data-pile={arrangement}
      className={classes.arrangementPreviewRoot}
      aria-label="Arrangement preview"
    >
      {timeline.error === null ? (
        <ArrangementPrints items={items} isPending={timeline.isPending} />
      ) : (
        <Stack gap="sm">
          <Prose role="alert">{timeline.error.message}</Prose>
          <Button
            variant="default"
            disabled={timeline.isFetching}
            onClick={() => {
              void timeline.refetch();
            }}
          >
            Retry miniature
          </Button>
        </Stack>
      )}
    </div>
  );
}
