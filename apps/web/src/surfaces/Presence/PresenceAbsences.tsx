import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";

/** States the product database's intentional absences and separate operational logs. */
export function PresenceAbsences(): ReactNode {
  return (
    <Sheet wide label="What is not recorded">
      <SheetHead title="What this does not record" />
      <Stack gap="md">
        <Prose>The product database does not record:</Prose>
        <ul>
          <li>IP addresses or location.</li>
          <li>
            Viewing duration, scrolling distance, pointer movement or taps.
          </li>
          <li>Where somebody stopped a video.</li>
          <li>Searches or filter choices.</li>
          <li>Whether somebody read a comment.</li>
        </ul>
        <Banner>
          <b>These are absences in the database, not settings.</b> There is
          nothing to switch on later.
        </Banner>
        <Prose>
          Deployment access logs are a separate operational record managed by
          the operator. They can contain request addresses and have their own
          retention.
        </Prose>
      </Stack>
    </Sheet>
  );
}
