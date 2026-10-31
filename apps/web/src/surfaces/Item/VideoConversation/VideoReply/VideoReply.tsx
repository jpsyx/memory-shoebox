import { getFailedCommentTagsFromDraft } from "@/api/comments/comments";
import { Group } from "@mantine/core";
import { MemberAvatar } from "@/system/MemberAvatar/MemberAvatar";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconSend } from "@tabler/icons-react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";
import classes from "./VideoReply.module.css";
import { CommentTagInputField } from "@/system/CommentTagInputField/CommentTagInputField";
import type { CommentDraft } from "@/system/commentDraftHelpers/commentDraftHelpers";

type Props = {
  itemId: string;
  parent: CommentDto;
  viewer: MemberRef;
  onSent: () => void;
  onCancel: () => void;
};

/** A one-level reply inherits its parent's moment on the server. */
export function VideoReply({
  itemId,
  parent,
  viewer,
  onSent,
  onCancel,
}: Readonly<Props>): ReactNode {
  const [draft, setDraft] = useState<CommentDraft>({
    body: "",
    commentTags: [],
  });
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const body = draft.body;
  const write = useCreateComment(itemId);
  const isMounted = useRef(false);
  useLayoutEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const submit = () => {
    if (
      body.trim() === "" ||
      body.length > 4000 ||
      write.isSending ||
      getFailedCommentTagsFromDraft({ draft, failures: write.tagFailure })
        .length > 0
    ) {
      return;
    }
    const submitted = draft;
    write.send({
      draft: { ...draft, parentCommentId: parent.commentId },
      onSent: () => {
        if (isMounted.current && currentDraft.current === submitted) {
          onSent();
        }
      },
    });
  };
  return (
    <form
      className={classes.videoReply}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Group align="flex-start" wrap="nowrap">
        <MemberAvatar member={viewer} size={30} />
        <CommentTagInputField
          itemId={itemId}
          fieldRef={fieldRef}
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          isSending={write.isSending}
          tagFailure={write.tagFailure}
          label={`Reply to ${parent.author.displayName}`}
          placeholder="Write a reply…"
          autoFocus
        />
      </Group>
      <div className={classes.videoReplyActions}>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={classes.videoReplySend}
          type="submit"
          aria-label="Post reply"
          aria-keyshortcuts="Meta+Enter Control+Enter"
          title="Send reply (⌘ Enter or Ctrl Enter)"
          aria-disabled={body.trim() === "" || write.isSending}
          aria-busy={write.isSending}
        >
          <IconSend size={17} />
        </button>
      </div>
      {write.error === undefined ? null : (
        <p className={classes.videoReplyError} role="alert">
          {write.error}
        </p>
      )}
    </form>
  );
}
