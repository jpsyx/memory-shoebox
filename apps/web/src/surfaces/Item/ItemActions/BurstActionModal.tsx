import { Modal, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import { Prose } from "@/system/typography/Prose";
import {
  useSetItemBurst,
  type ItemBurstWrite,
} from "@/surfaces/Item/itemWrites/useSetItemBurst/useSetItemBurst";

type Props = {
  itemId: string;
  action: "remove" | "restore";
  onClose: () => void;
};

/** The pending choices keep their keyboard focus and suppress repeat presses. */
function _renderChoices({
  write,
  label,
  onClose,
}: Readonly<{
  write: ItemBurstWrite;
  label: string;
  onClose: () => void;
}>): ReactNode {
  return (
    <ChipRow>
      <FocusKeepingButton
        variant="filled"
        isUnavailable={write.isPending}
        onClick={() => {
          return write.save(onClose);
        }}
      >
        {write.isPending ? "Saving" : label}
      </FocusKeepingButton>
      <FocusKeepingButton
        variant="default"
        isUnavailable={write.isPending}
        onClick={onClose}
      >
        Cancel
      </FocusKeepingButton>
    </ChipRow>
  );
}

/** Confirms a reversible membership change, keeping the photo in the archive. */
export function BurstActionModal({
  itemId,
  action,
  onClose,
}: Readonly<Props>): ReactNode {
  const write = useSetItemBurst(itemId, action);
  const label = action === "remove" ? "Make standalone" : "Return to burst";
  return (
    <Modal
      opened
      onClose={onClose}
      title={
        action === "remove" ? "Make this photo standalone?" : "Return to burst?"
      }
      closeOnEscape={!write.isPending}
      closeOnClickOutside={!write.isPending}
      withCloseButton={!write.isPending}
    >
      <Stack gap="md">
        <Prose>
          {action === "remove"
            ? "This photo will appear on its own in the timeline. You can return it to its burst from photo details."
            : "This photo will rejoin its original burst. You can make it standalone again at any time."}
        </Prose>
        {write.error === undefined ? null : (
          <Prose role="alert">{write.error}</Prose>
        )}
        {_renderChoices({ write, label, onClose })}
      </Stack>
    </Modal>
  );
}
