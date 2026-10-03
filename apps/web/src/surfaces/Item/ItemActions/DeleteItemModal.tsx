import { Button, Modal, Stack } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Banner } from "@/system/Chrome/Banner";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { deleteItemProse, kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";
import { useDeleteItem } from "@/surfaces/Item/itemWrites/useDeleteItem";

type Props = {
  detail: ItemDetail;
  opened: boolean;
  onClose: () => void;
  /** The way out, taken once the server has destroyed it. */
  onDeleted: () => void;
};

/**
 * Says what is destroyed and what goes with it, then destroys it. Not a hidden
 * flag: the record and the file both go.
 */
export function DeleteItemModal({
  detail,
  opened,
  onClose,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const removal = useDeleteItem(detail.itemId);
  const noun = kindNoun(detail.kind);
  return (
    <Modal opened={opened} onClose={onClose} title={`Delete this ${noun}?`}>
      <Stack gap="md">
        <Prose>
          {deleteItemProse({ commentCount: detail.comments.length })}
        </Prose>
        <Banner icon={<IconTrash {...ICON_PROPS} />}>
          This is not a hidden flag. A family member who asks for a {noun} to
          come down expects it to be gone, so it is gone.
        </Banner>
        {removal.error === undefined ? null : (
          <Prose role="alert">{removal.error}</Prose>
        )}
        <ChipRow>
          <Button
            variant="danger"
            disabled={removal.isDeleting}
            onClick={() => {
              removal.remove(onDeleted);
            }}
          >
            {removal.isDeleting ? "Deleting" : "Delete it"}
          </Button>
          <Button variant="default" onClick={onClose}>
            Keep it
          </Button>
        </ChipRow>
      </Stack>
    </Modal>
  );
}
