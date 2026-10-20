import { useLayoutEffect, useRef, type RefObject } from "react";
import { isFocusLostOrWithin } from "@/system/focusHelpers";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import {
  useCreateComment,
  type CommentSend,
} from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";
import { useItemCommentDraftMemory } from "../ItemCommentDraftProvider/ItemCommentDraftProvider";

type ItemCommentDraft = CommentSend & {
  body: string;
  setBody: (body: string) => void;
  atSeconds: number | undefined;
  start: () => void;
  toggleMoment: () => void;
  submit: () => void;
};
type DraftOptions = {
  itemId: string;
  transport?: VideoTransport;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};

type SubmissionOptions = DraftOptions & {
  memory: ReturnType<typeof useItemCommentDraftMemory>;
  write: CommentSend;
  owner: RefObject<string | undefined>;
};

/** Positions displayed as 0:00 mean the whole video. */
function _getMomentFromTransport(
  transport: VideoTransport,
): number | undefined {
  const position = transport.getAnnotationPosition();
  return position < 1 ? undefined : position;
}

function _toggleDraftMoment({
  itemId,
  transport,
  fieldRef,
  memory,
}: Readonly<
  DraftOptions & {
    memory: ReturnType<typeof useItemCommentDraftMemory>;
  }
>): void {
  if (transport === undefined) {
    return;
  }
  transport.pause();
  memory.update(itemId, {
    hasStarted: true,
    atSeconds:
      memory.read(itemId).atSeconds === undefined
        ? _getMomentFromTransport(transport)
        : undefined,
  });
  fieldRef.current?.focus();
}

function _submitDraft({
  itemId,
  memory,
  write,
  transport,
  fieldRef,
  owner,
}: Readonly<SubmissionOptions>): void {
  const submitted = memory.read(itemId);
  if (submitted.body.trim() === "" || write.isSending) {
    return;
  }
  const submittedField = fieldRef.current;
  write.send({
    draft: { body: submitted.body, atSeconds: submitted.atSeconds ?? null },
    onSent: () => {
      if (memory.read(itemId).revision === submitted.revision) {
        memory.remove(itemId);
      }
      if (
        transport === undefined &&
        owner.current === itemId &&
        submittedField !== null &&
        fieldRef.current === submittedField &&
        isFocusLostOrWithin(submittedField.form ?? undefined)
      ) {
        submittedField.focus();
      }
    },
  });
}

/** A draft captures one moment; focus and playback never move it afterward. */
export function useItemCommentDraft(
  options: Readonly<DraftOptions>,
): ItemCommentDraft {
  const { itemId, transport } = options;
  const memory = useItemCommentDraftMemory();
  const draft = memory.read(itemId);
  const write = useCreateComment(itemId);
  const owner = useRef<string | undefined>(itemId);
  useLayoutEffect(() => {
    owner.current = itemId;
    return () => {
      owner.current = undefined;
    };
  }, [itemId]);
  return {
    ...write,
    body: draft.body,
    atSeconds: draft.atSeconds,
    setBody: (body) => {
      return memory.update(itemId, { body });
    },
    start: () => {
      if (memory.read(itemId).hasStarted || transport === undefined) {
        return;
      }
      transport.pause();
      memory.update(itemId, {
        hasStarted: true,
        atSeconds: _getMomentFromTransport(transport),
      });
    },
    toggleMoment: () => {
      _toggleDraftMoment({ ...options, memory });
    },
    submit: () => {
      return _submitDraft({ ...options, memory, write, owner });
    },
  };
}
