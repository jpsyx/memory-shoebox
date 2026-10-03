import { Button } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { DeleteItemModal } from "@/surfaces/Item/ItemActions/DeleteItemModal";
import {
  deleteReasonProse,
  kindNoun,
} from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  /** The way out, taken once the server has destroyed it. */
  onDeleted: () => void;
};

/**
 * Delete, for its uploader or an admin: the button, why this viewer may, and
 * the dialog that says what goes with it. The caller draws this only when
 * `capabilities.canDelete` says so.
 */
export function DeleteAction({
  detail,
  viewer,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const [isDeleting, setIsDeleting] = useState(false);
  return (
    <>
      <ChipRow>
        <Button
          variant="danger"
          leftSection={<IconTrash {...ICON_PROPS} />}
          onClick={() => {
            return setIsDeleting(true);
          }}
        >
          {`Delete this ${kindNoun(detail.kind)}`}
        </Button>
      </ChipRow>
      <Prose>
        {deleteReasonProse(viewer.memberId === detail.uploadedBy.memberId)}
      </Prose>
      <DeleteItemModal
        detail={detail}
        opened={isDeleting}
        onClose={() => {
          return setIsDeleting(false);
        }}
        onDeleted={onDeleted}
      />
    </>
  );
}
