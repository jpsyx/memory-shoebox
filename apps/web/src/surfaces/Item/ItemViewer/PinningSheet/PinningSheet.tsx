import { Button, Stack } from "@mantine/core";
import { IconPinned } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import classes from "@/surfaces/Item/ItemViewer/PinningSheet/PinningSheet.module.css";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";

type Props = {
  transport: VideoTransport;
};

/**
 * How a comment comes to stand at a moment, said out loud, because nobody
 * guesses that feature. Pressing the button pins at wherever the transport
 * stands; pressing it again, or Unpin under the composer, takes it away.
 *
 * The button names what pressing it does, "Unpin from 0:18" once a pin is
 * set, rather than carrying a pressed state: a toggle whose name changed
 * with its state would say neither what it is nor what it will do.
 */
export function PinningSheet({ transport }: Readonly<Props>): ReactNode {
  const { pendingAt } = transport;
  return (
    <Sheet label="Pinning a comment">
      <Stack gap="sm">
        <LabelText component="h2">Comments on a moment</LabelText>
        <Prose>
          Pause the video at a moment, then pin your comment before writing it.
        </Prose>
        <ChipRow>
          <Button
            variant={pendingAt === undefined ? "default" : "filled"}
            leftSection={<IconPinned {...ICON_PROPS} />}
            classNames={{
              root: classes.pinningSheetButton,
              label: classes.pinningSheetButtonLabel,
            }}
            onClick={() => {
              transport.setPendingAt(
                pendingAt === undefined ? transport.position : undefined,
              );
            }}
          >
            {pendingAt === undefined
              ? "Pin a comment to this moment"
              : `Unpin from ${clockLabel(pendingAt)}`}
          </Button>
        </ChipRow>
      </Stack>
    </Sheet>
  );
}
