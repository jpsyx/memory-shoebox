import type { StorageUsageDto } from "@memory-shoebox/shared";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
/**
 * Catalog totals count original indexed media, not bucket renditions or
 * orphans.
 */
export function SettingsStorage({
  storage,
}: Readonly<{ storage: StorageUsageDto }>): ReactNode {
  return (
    <Sheet wide label="Storage">
      <SheetHead title="Where the files live" />
      <Stack gap="sm">
        <LabelText component="h3">Backblaze B2</LabelText>
        <Prose>
          {storage.itemCount.toLocaleString()} files,{" "}
          {(storage.byteSize / 1_000_000_000).toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}{" "}
          GB, indexed in the catalog. These are original files, not renditions
          or unindexed objects, in a bucket you own. Memory Shoebox indexes
          them; it does not own them. If this software disappeared tomorrow the
          files would still be sitting there.
        </Prose>
      </Stack>
    </Sheet>
  );
}
