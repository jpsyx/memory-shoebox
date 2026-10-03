import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Describing } from "@/surfaces/Item/Describing/Describing";
import { InThisOne } from "@/surfaces/Item/InThisOne/InThisOne";
import { ItemActions } from "@/surfaces/Item/ItemActions/ItemActions";
import { ItemTalk } from "@/surfaces/Item/ItemTalk/ItemTalk";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { WhenTaken } from "@/surfaces/Item/WhenTaken/WhenTaken";
import { WhoCanSee } from "@/surfaces/Item/WhoCanSee/WhoCanSee";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  /** `settings.timezone`, for a capture whose file carried no offset. */
  timezone: string;
  /** The video's transport, which the thread pins to and seeks. */
  transport: VideoTransport;
  /** The way out, taken once a delete has landed. */
  onDeleted: () => void;
};

/**
 * The right column: the thread, then the sheets this viewer's capabilities
 * allow. Every sheet is drawn from `detail.capabilities` and nothing else
 * (decision 4), never from a role.
 */
export function ItemSheets({
  detail,
  viewer,
  timezone,
  transport,
  onDeleted,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <ItemTalk detail={detail} viewer={viewer} transport={transport} />
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
