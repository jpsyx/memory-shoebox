import { Button, Stack } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { makeOriginalHrefFromItemId } from "@/api/items/items";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import { ItemPresenceAction } from "./ItemPresenceAction/ItemPresenceAction";
import { DeleteAction } from "@/surfaces/Item/ItemActions/DeleteAction";
import { RemovalAsk } from "@/surfaces/Item/ItemActions/RemovalAsk";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  /** The way out, taken once the server has destroyed it. */
  onDeleted: () => void;
};

/**
 * Download the original, for everybody; the removal ask, for somebody tagged
 * in somebody else's photograph; and delete, for its uploader or an admin.
 * The removal ask also excludes the item's uploader. An admin tagged in
 * somebody else's photograph can be offered both removal and delete.
 */
export function ItemActions({
  detail,
  viewer,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const { capabilities } = detail;
  const canAskForRemoval =
    capabilities.canRequestRemoval &&
    detail.uploadedBy.memberId !== viewer.memberId;
  return (
    <Sheet label="Actions">
      <Stack gap="sm">
        <ChipRow>
          <Button
            component="a"
            href={makeOriginalHrefFromItemId(detail.itemId)}
            download
            variant="default"
            leftSection={<IconDownload {...ICON_PROPS} />}
          >
            Download the original
          </Button>
          <ItemPresenceAction itemId={detail.itemId} />
        </ChipRow>
        {canAskForRemoval ? <RemovalAsk detail={detail} /> : null}
        {capabilities.canDelete ? (
          <DeleteAction detail={detail} viewer={viewer} onDeleted={onDeleted} />
        ) : null}
      </Stack>
    </Sheet>
  );
}
