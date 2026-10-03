import { Button, Stack } from "@mantine/core";
import { IconPinned } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";

type Props = {
  transport: VideoTransport;
};

/**
 * How a comment comes to stand at a moment, said out loud, because nobody
 * guesses that feature. Pressing the button pins at wherever the transport
 * stands; pressing it again, or Unpin under the composer, takes it away.
 */
export function PinningSheet({ transport }: Readonly<Props>): ReactNode {
  const { pendingAt } = transport;
  return (
    <Sheet label="Pinning a comment">
      <Stack gap="sm">
        <LabelText component="h2">Comments on a moment</LabelText>
        <Prose>
          A comment can stand at a moment rather than at the bottom. Press the
          bar where it happens, write it, and it shows up there for everybody:
          on the scrubber and in the thread with the time attached.
        </Prose>
        <ChipRow>
          <Button
            variant={pendingAt === undefined ? "default" : "filled"}
            aria-pressed={pendingAt !== undefined}
            leftSection={<IconPinned {...ICON_PROPS} />}
            classNames={{
              root: classes.pinButton,
              label: classes.pinButtonLabel,
            }}
            onClick={() => {
              transport.setPendingAt(
                pendingAt === undefined ? transport.position : undefined,
              );
            }}
          >
            {pendingAt === undefined
              ? "Pin a comment to this moment"
              : `Pinned at ${clockLabel(pendingAt)}`}
          </Button>
        </ChipRow>
      </Stack>
    </Sheet>
  );
}
