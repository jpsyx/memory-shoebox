import { IconClock, IconSend, IconX } from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";
import type { MemberRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { getInitialsFromDisplayName } from "./videoMomentHelpers/videoMomentHelpers";
import { useVideoDraft } from "./useVideoDraft";
import classes from "./VideoConversation.module.css";

type Props = {
  itemId: string;
  viewer: MemberRef;
  transport: VideoTransport;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};

/** Composer preserves words and their chosen moment until the write succeeds. */
export function VideoComposer({
  itemId,
  viewer,
  transport,
  fieldRef,
}: Readonly<Props>): ReactNode {
  const draft = useVideoDraft({ itemId, transport, fieldRef });
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
          placeholder="Say something about this moment…"
          value={draft.body}
          onFocus={draft.start}
          onChange={(event) => {
            draft.setBody(event.currentTarget.value);
          }}
        />
      </div>
      <div className={classes.composerActions}>
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
        <button
          className={classes.send}
          type="submit"
          aria-label="Post comment"
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
