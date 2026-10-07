import { ObservationReadBoundary } from "@/surfaces/Observations/ObservationReadBoundary";
import { Stack } from "@mantine/core";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { itemQueryOptions } from "@/api/items/items";
import { makeItemViewersQueryOptionsFromItemId } from "@/api/observationHelpers/observationHelpers";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ItemViewersContent } from "./ItemViewersContent";
type Props = { itemId: string; timezone: string };

/**
 * A passive viewer report reusing cached item context, with viewer-only
 * retries.
 */
export function ItemViewers({ itemId, timezone }: Readonly<Props>): ReactNode {
  const item = useQuery({
    ...itemQueryOptions(itemId),
    queryFn: skipToken,
    enabled: false,
  });
  const viewers = useQuery(makeItemViewersQueryOptionsFromItemId(itemId));
  const retry = () => {
    void viewers.refetch();
  };
  return (
    <Sheet wide label="Who has opened this item">
      <SheetHead title="Who has opened this one" />
      <Stack gap="md">
        <ObservationReadBoundary
          error={viewers.error ?? undefined}
          hasData={viewers.data !== undefined}
          onRetry={() => {
            void viewers.refetch();
          }}
        >
          <ItemViewersContent
            itemId={itemId}
            item={item.data}
            viewers={viewers.data}
            timezone={timezone}
            isPending={viewers.isPending}
            onRetry={retry}
          />
        </ObservationReadBoundary>
        <Banner>
          <b>Only an admin sees this.</b> Seen on the timeline and opened at
          full size are shown separately.
        </Banner>
      </Stack>
    </Sheet>
  );
}
