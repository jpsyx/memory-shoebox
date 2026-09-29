import { Button, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { healthQueryOptions } from "@/api/health";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";

/**
 * Where the source of this instance lives.
 *
 * **AGPL-3.0 section 13 makes this a product requirement rather than a
 * footnote**: a modified version offered over a network has to offer its
 * source to the people using it, so "the interface needs a reachable way to
 * get at the source" (`PRODUCT.md` § How it works).
 *
 * A constant because there is nowhere to configure it: `SETTING_DEFINITIONS`
 * has nine keys and none of them is a source URL. **A self-hoster who modifies
 * this code has to edit this line**, which is a real gap rather than a design:
 * whoever builds surface 11 should consider a `shoebox.source_url` key.
 */
const SOURCE_URL = "https://github.com/jpsyx/memory-shoebox";

/**
 * The licence sheet: what this software is, and how to get the source of it.
 *
 * The version sits beside the link because section 13 is about the source of
 * the exact version running here, not about the project in general. It comes
 * from `GET /api/health`, which already answers with the server's package
 * version, and the line is simply absent while that read is in flight: a
 * version somebody cannot yet trust is worse than no version at all.
 */
export function LicenceSheet(): ReactNode {
  const { data: health } = useQuery(healthQueryOptions);

  return (
    <Sheet wide label="Licence">
      <Stack gap="sm">
        <LabelText component="h2">About this archive</LabelText>
        <Prose>
          Memory Shoebox is free software under the AGPL. You are entitled to
          the source of the exact version running this Shoebox.
        </Prose>
        <ChipRow>
          <Button
            component="a"
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            variant="default"
          >
            Get the source
          </Button>
          {health === undefined ? null : (
            <Prose>You are running version {health.version}.</Prose>
          )}
        </ChipRow>
      </Stack>
    </Sheet>
  );
}
