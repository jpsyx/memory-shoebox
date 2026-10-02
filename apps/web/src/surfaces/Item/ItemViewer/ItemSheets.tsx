import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { ItemTalk } from "@/surfaces/Item/ItemTalk/ItemTalk";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * The right column: the thread, then the sheets this viewer's capabilities
 * allow. Every sheet is drawn from `detail.capabilities` and nothing else
 * (decision 4), never from a role.
 */
export function ItemSheets({ detail, viewer }: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <ItemTalk detail={detail} viewer={viewer} />
    </Stack>
  );
}
