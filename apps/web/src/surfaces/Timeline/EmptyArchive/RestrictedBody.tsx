import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
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
        No photos or videos are shared with you yet. Ask whoever invited you
        about it.
      </Prose>
    </Stack>
  );
}
