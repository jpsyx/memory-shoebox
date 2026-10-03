import { Modal, Stack } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { DeleteItemChoices } from "@/surfaces/Item/ItemActions/DeleteItemChoices";
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
 *
 * Once "Delete it" is pressed the dialog cannot be dismissed, by Escape, the
 * overlay or a close button. The hook lives here and stays mounted while the
 * dialog is closed, so closing it would not stop the request, and the page
 * would leave all the same.
 */
export function DeleteItemModal({
  detail,
  opened,
  onClose,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const removal = useDeleteItem(detail.itemId);
  const isBusy = removal.isDeleting || removal.isDeleted;
  const noun = kindNoun(detail.kind);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Delete this ${noun}?`}
      closeOnEscape={!isBusy}
      closeOnClickOutside={!isBusy}
      withCloseButton={!isBusy}
    >
      <Stack gap="md">
        <Prose>
          {deleteItemProse({ commentCount: detail.comments.length })}
        </Prose>
        <Banner icon={<IconTrash {...ICON_PROPS} />}>
          This is not a hidden flag. A family member who asks for a {noun} to
          come down expects it to be gone, so it is gone.
        </Banner>
        <DeleteItemChoices
          error={removal.error}
          isBusy={isBusy}
          onDelete={() => {
            removal.remove(onDeleted);
          }}
          onKeep={onClose}
        />
      </Stack>
    </Modal>
  );
}
