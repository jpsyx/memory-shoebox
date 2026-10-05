import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { itemQueryOptions } from "@/api/items/items";
import { itemViewersQueryOptions } from "@/api/observations/observations";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ItemViewersContent } from "./ItemViewersContent";

/** An item and its actual returned viewer rows, with independent safe read retries. */
export function ItemViewers(
  options: Readonly<{ itemId: string; timezone: string }>,
): ReactNode {
  const item = useQuery(itemQueryOptions(options.itemId));
  const viewers = useQuery({
    ...itemViewersQueryOptions(options.itemId),
    enabled: item.data !== undefined,
  });
  const retry = () => {
    if (item.data === undefined) void item.refetch();
    else void viewers.refetch();
  };
  return (
    <Sheet wide label="Who has opened this item">
      <SheetHead title="Who has opened this one" />
      <Stack gap="md">
        <ItemViewersContent
          item={item.data}
          viewers={viewers.data}
          timezone={options.timezone}
          isPending={
            item.isPending || (item.data !== undefined && viewers.isPending)
          }
          onRetry={retry}
        />
        <Banner>
          <b>Only an admin sees this.</b> Seen in the pile and opened at full
          size are shown separately.
        </Banner>
      </Stack>
    </Sheet>
  );
}
