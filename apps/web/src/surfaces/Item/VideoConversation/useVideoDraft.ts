import { useRef, useState, type RefObject } from "react";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import {
  useCreateComment,
  type CommentSend,
} from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";

type VideoDraft = CommentSend & {
  body: string;
  setBody: (body: string) => void;
  atSeconds: number | undefined;
  start: () => void;
  toggleMoment: () => void;
  submit: () => void;
};

/** A draft captures one moment; focus and playback never move it afterward. */
export function useVideoDraft(
  options: Readonly<{
    itemId: string;
    transport: VideoTransport;
    fieldRef: RefObject<HTMLTextAreaElement | null>;
  }>,
): VideoDraft {
  const { itemId, transport, fieldRef } = options;
  const [body, setBody] = useState("");
  const [atSeconds, setAtSeconds] = useState<number>();
  const hasStarted = useRef(false);
  const write = useCreateComment(itemId);
  const start = () => {
    if (hasStarted.current) {
      return;
    }
    hasStarted.current = true;
    transport.videoRef.current?.pause();
    setAtSeconds(transport.videoRef.current?.currentTime ?? transport.position);
  };
  return {
    body,
    setBody,
    atSeconds,
    start,
    ...write,
    toggleMoment: () => {
      hasStarted.current = true;
      transport.videoRef.current?.pause();
      setAtSeconds((current) => {
        return current === undefined
          ? (transport.videoRef.current?.currentTime ?? transport.position)
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
          if (fieldRef.current?.value === sentBody) {
            hasStarted.current = false;
            setAtSeconds(undefined);
          }
        },
      });
    },
  };
}
