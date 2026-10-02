import type { ReactNode } from "react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { CommentRow } from "@/system/Talk/CommentRow";
import {
  useCommentReaction,
  useDeleteComment,
  useEditComment,
} from "@/surfaces/Item/itemWrites/useConversation";

type Props = {
  itemId: string;
  comment: CommentDto;
  viewer: MemberRef;
  onSeek?: (seconds: number) => void;
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
}: Readonly<Props>): ReactNode {
  const { commentId } = comment;
  const edit = useEditComment({ itemId, commentId });
  const removal = useDeleteComment({ itemId, commentId });
  const reaction = useCommentReaction({ itemId, commentId, viewer });
  return (
    <CommentRow
      comment={comment}
      viewer={viewer}
      onSeek={onSeek}
      onSaveEdit={edit.save}
      isSaving={edit.isSaving}
      onDelete={removal.remove}
      onReact={reaction.react}
      error={edit.error ?? removal.error ?? reaction.error}
    />
  );
}
