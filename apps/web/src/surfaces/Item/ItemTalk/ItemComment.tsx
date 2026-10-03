import type { ReactNode } from "react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { CommentRow } from "@/system/Talk/CommentRow";
import {
  useCommentReaction,
  useDeleteComment,
  useEditComment,
} from "@/surfaces/Item/itemWrites/useConversation";
import { useFocusAfterDelete } from "@/surfaces/Item/ItemTalk/useFocusAfterDelete";

type Props = {
  itemId: string;
  comment: CommentDto;
  viewer: MemberRef;
  onSeek?: (seconds: number) => void;
  /** Its own delete took the row away, and focus went with it. */
  onFocusLost?: () => void;
};

/**
 * One comment, with its three writes. Each comment holds its own, so one
 * comment saving does not grey out another's Edit.
 */
export function ItemComment({
  itemId,
  comment,
  viewer,
  onSeek,
  onFocusLost,
}: Readonly<Props>): ReactNode {
  const { commentId } = comment;
  const edit = useEditComment({ itemId, commentId });
  const removal = useDeleteComment({ itemId, commentId });
  const reaction = useCommentReaction({ itemId, commentId, viewer });
  const onDeleted = useFocusAfterDelete(onFocusLost);
  return (
    <CommentRow
      comment={comment}
      viewer={viewer}
      onSeek={onSeek}
      onSaveEdit={edit.save}
      isSaving={edit.isSaving}
      onDelete={() => {
        removal.remove(onDeleted);
      }}
      onReact={reaction.react}
      error={edit.error ?? removal.error ?? reaction.error}
    />
  );
}
