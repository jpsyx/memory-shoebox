import { useRef, useState, type RefObject } from "react";
import { isFocusLostOrWithin } from "@/system/focusHelpers";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import {
  useCreateComment,
  type CommentSend,
} from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";

type ItemCommentDraft = CommentSend & {
  body: string;
  setBody: (body: string) => void;
  atSeconds: number | undefined;
  start: () => void;
  toggleMoment: () => void;
  submit: () => void;
};

/** A draft captures one moment; focus and playback never move it afterward. */
export function useItemCommentDraft(
  options: Readonly<{
    itemId: string;
    transport?: VideoTransport;
    fieldRef: RefObject<HTMLTextAreaElement | null>;
  }>,
): ItemCommentDraft {
  const { itemId, transport, fieldRef } = options;
  const [body, setBody] = useState("");
  const [atSeconds, setAtSeconds] = useState<number>();
  const hasStarted = useRef(false);
  const write = useCreateComment(itemId);
  const start = () => {
    if (hasStarted.current || transport === undefined) {
      return;
    }
    hasStarted.current = true;
    transport.pause();
    setAtSeconds(_getMomentFromTransport(transport));
  };
  return {
    body,
    setBody,
    atSeconds,
    start,
    ...write,
    toggleMoment: () => {
      if (transport === undefined) {
        return;
      }
      hasStarted.current = true;
      transport.pause();
      setAtSeconds((current) => {
        return current === undefined
          ? _getMomentFromTransport(transport)
          : undefined;
      });
      fieldRef.current?.focus();
    },
    submit: () => {
      if (body.trim() === "" || write.isSending) {
        return;
      }
      const sentBody = body;
      write.send({
        draft: { body: sentBody, atSeconds: atSeconds ?? null },
        onSent: () => {
          setBody((current) => {
            return current === sentBody ? "" : current;
          });
          if (
            transport === undefined &&
            isFocusLostOrWithin(fieldRef.current?.form ?? undefined)
          ) {
            fieldRef.current?.focus();
          }
          if (fieldRef.current?.value === sentBody) {
            hasStarted.current = false;
            setAtSeconds(undefined);
          }
        },
      });
    },
  };
}

/** Positions displayed as 0:00 mean the whole video. */
function _getMomentFromTransport(
  transport: VideoTransport,
): number | undefined {
  const position = transport.getAnnotationPosition();
  return position < 1 ? undefined : position;
}
