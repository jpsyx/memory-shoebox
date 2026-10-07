import { useState, type ReactNode } from "react";
import { IconSend } from "@tabler/icons-react";
import type { CommentDto } from "@memory-shoebox/shared";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";
import classes from "./VideoConversation.module.css";

type Props = {
  itemId: string;
  parent: CommentDto;
  onSent: () => void;
  onCancel: () => void;
};

/** A one-level reply inherits its parent's moment on the server. */
export function VideoReply({
  itemId,
  parent,
  onSent,
  onCancel,
}: Readonly<Props>): ReactNode {
  const [body, setBody] = useState("");
  const write = useCreateComment(itemId);
  return (
    <form
      className={classes.replyForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim() !== "" && !write.isSending) {
          write.send({
            draft: { body, parentCommentId: parent.commentId },
            onSent,
          });
        }
      }}
    >
      <textarea
        rows={2}
        autoFocus
        aria-label={`Reply to ${parent.author.displayName}`}
        placeholder="Write a reply…"
        value={body}
        onChange={(event) => {
          setBody(event.currentTarget.value);
        }}
      />
      <div className={classes.replyActions}>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={classes.send}
          type="submit"
          aria-label="Post reply"
          aria-disabled={body.trim() === "" || write.isSending}
          aria-busy={write.isSending}
        >
          <IconSend size={17} />
        </button>
      </div>
      {write.error === undefined ? null : (
        <p className={classes.error} role="alert">
          {write.error}
        </p>
      )}
    </form>
  );
}
