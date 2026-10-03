import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Describing } from "@/surfaces/Item/Describing/Describing";
import { InThisOne } from "@/surfaces/Item/InThisOne/InThisOne";
import { ItemTalk } from "@/surfaces/Item/ItemTalk/ItemTalk";
import { WhenTaken } from "@/surfaces/Item/WhenTaken/WhenTaken";
import { WhoCanSee } from "@/surfaces/Item/WhoCanSee/WhoCanSee";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  /** `settings.timezone`, for a capture whose file carried no offset. */
  timezone: string;
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
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <ItemTalk detail={detail} viewer={viewer} />
      <InThisOne detail={detail} />
      {detail.capabilities.canSetVisibility ? (
        <WhoCanSee detail={detail} viewer={viewer} />
      ) : null}
      {detail.capabilities.canFixCaptureDate ? (
        <WhenTaken detail={detail} timezone={timezone} />
      ) : null}
      {detail.capabilities.canDescribe ? <Describing detail={detail} /> : null}
    </Stack>
  );
}
