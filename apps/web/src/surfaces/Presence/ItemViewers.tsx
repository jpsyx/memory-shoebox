import { ObservationReadBoundary } from "@/surfaces/Observations/ObservationReadBoundary";
import { Stack } from "@mantine/core";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { itemQueryOptions } from "@/api/items/items";
import { itemViewersQueryOptions } from "@/api/observations/observations";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ItemViewersContent } from "./ItemViewersContent";

/** A passive viewer report reusing cached item context, with viewer-only retries. */
export function ItemViewers(
  options: Readonly<{ itemId: string; timezone: string }>,
): ReactNode {
  const item = useQuery({
    ...itemQueryOptions(options.itemId),
    queryFn: skipToken,
    enabled: false,
  });
  const viewers = useQuery(itemViewersQueryOptions(options.itemId));
  const retry = () => {
    void viewers.refetch();
  };
  return (
    <Sheet wide label="Who has opened this item">
      <SheetHead title="Who has opened this one" />
      <Stack gap="md">
        <ObservationReadBoundary
          error={viewers.error}
          hasData={viewers.data !== undefined}
          onRetry={() => {
            void viewers.refetch();
          }}
        >
          <ItemViewersContent
            itemId={options.itemId}
            item={item.data}
            viewers={viewers.data}
            timezone={options.timezone}
            isPending={viewers.isPending}
            onRetry={retry}
          />
        </ObservationReadBoundary>
        <Banner>
          <b>Only an admin sees this.</b> Seen in the pile and opened at full
          size are shown separately.
        </Banner>
      </Stack>
    </Sheet>
  );
}
