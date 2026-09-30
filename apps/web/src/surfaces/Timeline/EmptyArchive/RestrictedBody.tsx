import { Stack } from "@mantine/core";
import { IconEyeOff } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS } from "@/system/icons";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

/**
 * The viewer body: nothing shared, and nobody named.
 *
 * The member list is not available here and must not be: this is not an
 * admin route, so there is no name to put in the sentence. It names nobody,
 * and it is prose rather than a control, because there is nothing in the
 * product for such a control to do yet.
 */
export function RestrictedBody(): ReactNode {
  return (
    <Stack gap="md">
      <Lede>Nothing here for you yet.</Lede>
      <Prose onPanel>
        There is an archive behind this, and right now none of it is shared with
        you. Whoever put it up decides that photograph by photograph, and it can
        change at any time without anybody having to ask you again. Ask whoever
        invited you about it.
      </Prose>
      <Banner onPanel icon={<IconEyeOff {...ICON_PROPS} />}>
        This page looks exactly the same on a brand new archive with nothing in
        it. That is on purpose: a count of what you cannot see would tell you
        something about it.
      </Banner>
    </Stack>
  );
}
