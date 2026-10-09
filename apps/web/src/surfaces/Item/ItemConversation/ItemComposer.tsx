import { IconClock, IconSend, IconX } from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";
import type { MemberRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { getInitialsFromDisplayName } from "@/system/labelHelpers/getInitialsFromDisplayName";
import { useItemCommentDraft } from "./useItemCommentDraft";
import { submitCommentOnShortcut } from "./submitCommentOnShortcut";
import classes from "./ItemConversation.module.css";

type Props = {
  itemId: string;
  viewer: MemberRef;
  transport?: VideoTransport;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};

/** Composer preserves words and their chosen moment until the write succeeds. */
export function ItemComposer({
  itemId,
  viewer,
  transport,
  fieldRef,
}: Readonly<Props>): ReactNode {
  const draft = useItemCommentDraft({ itemId, transport, fieldRef });
  return (
    <form
      className={classes.composer}
      onSubmit={(event) => {
        event.preventDefault();
        draft.submit();
      }}
    >
      <div className={classes.composerInput}>
        <span className={classes.avatar} aria-hidden="true">
          {getInitialsFromDisplayName(viewer.displayName)}
        </span>
        <textarea
          ref={fieldRef}
          rows={2}
          aria-label="Write a comment"
          placeholder={
            transport === undefined
              ? "Say something about this photo…"
              : "Say something about this moment…"
          }
          value={draft.body}
          onFocus={draft.start}
          onKeyDown={submitCommentOnShortcut}
          onChange={(event) => {
            draft.setBody(event.currentTarget.value);
          }}
        />
      </div>
      <div className={classes.composerActions}>
        {transport === undefined ? null : (
          <button
            className={classes.anchorToggle}
            type="button"
            aria-pressed={draft.atSeconds !== undefined}
            aria-label={
              draft.atSeconds === undefined
                ? "Whole video; attach current moment"
                : `Comment at ${clockLabel(draft.atSeconds)}; switch to whole video`
            }
            onClick={draft.toggleMoment}
            disabled={draft.isSending}
          >
            <IconClock size={15} />
            {draft.atSeconds === undefined
              ? "Whole video"
              : clockLabel(draft.atSeconds)}
            {draft.atSeconds === undefined ? null : <IconX size={12} />}
          </button>
        )}
        <button
          className={classes.send}
          type="submit"
          aria-label="Post comment"
          aria-keyshortcuts="Meta+Enter Control+Enter"
          title="Send comment (⌘ Enter or Ctrl Enter)"
          aria-disabled={draft.body.trim() === "" || draft.isSending}
          aria-busy={draft.isSending}
        >
          <IconSend size={18} />
        </button>
      </div>
      {draft.error === undefined ? null : (
        <p className={classes.error} role="alert">
          {draft.error}
        </p>
      )}
    </form>
  );
}
