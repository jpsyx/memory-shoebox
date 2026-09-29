import { Stack } from "@mantine/core";
import {
  IconAdjustments,
  IconEye,
  IconFlag,
  IconUsers,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { AdminDoor } from "@/surfaces/Account/AdminDoors/AdminDoor";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";

/**
 * The five doors only an admin can open, on My account rather than on the
 * top bar.
 *
 * Rendered by the surface only for an admin: this component does not read
 * the role itself, so there is one place that decides and no chance of the
 * two disagreeing.
 */
export function AdminDoors(): ReactNode {
  return (
    <Sheet wide label="Running this archive">
      <SheetHead title="You run this archive" />
      <Stack gap="md">
        <Prose>
          Five things only an admin can reach. They are here rather than on the
          top bar, because everybody else's bar should not carry doors they
          cannot open.
        </Prose>
        <ChipRow>
          <AdminDoor to="/settings" icon={<IconAdjustments {...ICON_PROPS} />}>
            Shoebox settings
          </AdminDoor>
          <AdminDoor to="/members" icon={<IconUsers {...ICON_PROPS} />}>
            Members and groups
          </AdminDoor>
          <AdminDoor to="/milestones">Milestones</AdminDoor>
          <AdminDoor to="/presence" icon={<IconEye {...ICON_PROPS} />}>
            Who has been looking
          </AdminDoor>
          {/*
           * The prototype reads "Removal requests · 2". The count is gone
           * rather than forgotten: it comes from the removal slice, which a
           * later step owns, and this step will not invent one. The word
           * alone is the door.
           */}
          <AdminDoor to="/removal-requests" icon={<IconFlag {...ICON_PROPS} />}>
            Removal requests
          </AdminDoor>
        </ChipRow>
        <Banner>
          <b>You can see every item in this Shoebox.</b> That is what running
          one means here, and it cannot be switched off, not even by another
          admin.
        </Banner>
      </Stack>
    </Sheet>
  );
}
