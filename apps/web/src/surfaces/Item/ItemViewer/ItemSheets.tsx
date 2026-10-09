import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Describing } from "@/surfaces/Item/Describing/Describing";
import { InThisOne } from "@/surfaces/Item/InThisOne/InThisOne";
import { ItemActions } from "@/surfaces/Item/ItemActions/ItemActions";
import { WhenTaken } from "@/surfaces/Item/WhenTaken/WhenTaken";
import { WhoCanSee } from "@/surfaces/Item/WhoCanSee/WhoCanSee";

type Props = {
  detail: ItemDetail;
  /** The item being left, while the next one loads: the column is inert. */
  isPlaceholder: boolean;
  viewer: MemberRef;
  /** `settings.timezone`, for a capture whose file carried no offset. */
  timezone: string;
  /** The way out, taken once a delete has landed. */
  onDeleted: () => void;
};

/**
 * The details drawer content: the sheets this viewer's capabilities
 * allow. Every sheet is drawn from `detail.capabilities` and nothing else,
 * never from a role. While it is the item being left it is inert, since every
 * write in it would land on that item.
 */
export function ItemSheets({
  detail,
  isPlaceholder,
  viewer,
  timezone,
  onDeleted,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md" inert={isPlaceholder}>
      <InThisOne detail={detail} />
      {detail.capabilities.canSetVisibility ? (
        <WhoCanSee detail={detail} viewer={viewer} />
      ) : null}
      {detail.capabilities.canFixCaptureDate ? (
        <WhenTaken detail={detail} timezone={timezone} />
      ) : null}
      {detail.capabilities.canDescribe ? <Describing detail={detail} /> : null}
      <ItemActions detail={detail} viewer={viewer} onDeleted={onDeleted} />
    </Stack>
  );
}
