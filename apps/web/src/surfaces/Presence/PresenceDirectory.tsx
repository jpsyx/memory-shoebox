import { ObservationReadBoundary } from "@/surfaces/Observations/ObservationReadBoundary";
import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { presenceQueryOptions } from "@/api/observations/observations";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { PresenceReadState } from "./PresenceReadState";
import { PresenceTable } from "./PresenceTable";

/** Server-ranked members and live counts; zeros remain visible facts. */
export function PresenceDirectory({
  timezone,
}: Readonly<{ timezone: string }>): ReactNode {
  const query = useQuery(presenceQueryOptions());
  return (
    <Sheet wide label="Every member">
      <SheetHead title="Everybody, most present first" />
      <Stack gap="md">
        <Prose>
          Days active counts local days with a recorded sighting, opening,
          comment or reaction. Opened means opened at full size. Counts describe
          items, comments and reactions still in the archive.
        </Prose>
        <ObservationReadBoundary
          error={query.error}
          hasData={query.data !== undefined}
          onRetry={() => {
            void query.refetch();
          }}
        >
          {query.data === undefined ? (
            <PresenceReadState
              isPending={query.isPending}
              label="presence records"
              onRetry={() => {
                void query.refetch();
              }}
            />
          ) : query.data.presence.length === 0 ? (
            <Prose>No active or invited members to show.</Prose>
          ) : (
            <PresenceTable rows={query.data.presence} timezone={timezone} />
          )}
        </ObservationReadBoundary>
        <Banner>
          <b>Last signed in is not last seen.</b> A phone used every day may not
          ask for another code. Last seen is the latest recorded use, not the
          last code sign-in.
        </Banner>
      </Stack>
    </Sheet>
  );
}
