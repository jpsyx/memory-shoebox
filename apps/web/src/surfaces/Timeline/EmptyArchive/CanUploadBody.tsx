import { Button, Stack } from "@mantine/core";
import { IconUpload, IconUsers } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

/**
 * The admin and uploader body: an invitation to put the first things up.
 *
 * A real anchor wearing a button's clothes, exactly as
 * `system/ProductBar/BarLink.tsx` and `AdminDoors/AdminDoor.tsx` already do:
 * Mantine's `component={Link}` collapses `Link`'s generics before `to`
 * narrows them, so a route that does not exist stops being a compile error.
 * Calling `Link` directly keeps `to` literal, and `classes.barLink` is the
 * reset that takes the browser's blue and underline off it.
 */
export function CanUploadBody(): ReactNode {
  return (
    <Stack gap="md">
      <Lede>Nothing on the door yet.</Lede>
      <Prose onPanel>Upload photos and videos to get started.</Prose>
      <ChipRow>
        <Link to="/upload" className={classes.barLink}>
          <Button component="span" leftSection={<IconUpload {...ICON_PROPS} />}>
            Upload media
          </Button>
        </Link>
        <Link to="/members" className={classes.barLink}>
          <Button
            component="span"
            variant="panel"
            leftSection={<IconUsers {...ICON_PROPS} />}
          >
            Invite people
          </Button>
        </Link>
      </ChipRow>
    </Stack>
  );
}
