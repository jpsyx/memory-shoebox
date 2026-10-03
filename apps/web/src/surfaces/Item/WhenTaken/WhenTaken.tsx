import { Button, Stack } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import {
  captureMomentLabel,
  getWallClockFromCapture,
} from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { TitleText } from "@/system/typography/TitleText";
import { captureSourceProse } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { useEditorToggle } from "@/surfaces/Item/useEditorToggle";
import { CaptureDateEditor } from "@/surfaces/Item/WhenTaken/CaptureDateEditor";

type Props = {
  detail: ItemDetail;
  timezone: string;
};

/**
 * When it was taken, for whoever put it there or runs the archive. The caller
 * draws this only when `capabilities.canFixCaptureDate` says so: the
 * correction belongs to the item's uploader, not to any uploader.
 */
export function WhenTaken({ detail, timezone }: Readonly<Props>): ReactNode {
  const editor = useEditorToggle();
  const wallClock = getWallClockFromCapture({
    capturedAt: detail.capturedAt,
    offsetMinutes: detail.capturedAtOffsetMinutes ?? undefined,
    timezone,
  });
  return (
    <Sheet label="When this was taken">
      <Stack gap="sm">
        <LabelText component="h2">When this was taken</LabelText>
        {editor.isEditing ? (
          <CaptureDateEditor
            detail={detail}
            timezone={timezone}
            wallClock={wallClock}
            onDone={editor.close}
          />
        ) : (
          <>
            <TitleText component="p">{captureMomentLabel(wallClock)}</TitleText>
            <Prose>
              {captureSourceProse({
                kind: detail.kind,
                captureSource: detail.captureSource,
              })}
            </Prose>
            <ChipRow>
              <Button
                ref={editor.openerRef}
                variant="default"
                leftSection={<IconCalendar {...ICON_PROPS} />}
                onClick={editor.open}
              >
                Put the date right
              </Button>
            </ChipRow>
          </>
        )}
      </Stack>
    </Sheet>
  );
}
