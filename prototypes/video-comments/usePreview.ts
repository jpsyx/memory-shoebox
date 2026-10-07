import { useEffect, useRef, useState } from "react";
import {
  SAMPLE_COMMENTS,
  SAMPLE_REACTIONS,
  type Comment,
  type Reaction,
} from "./model";

/** Local-only draft state for the two review compositions. */
function usePreviewState() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [comments, setComments] = useState<readonly Comment[]>(SAMPLE_COMMENTS);
  const [reactions, setReactions] =
    useState<readonly Reaction[]>(SAMPLE_REACTIONS);
  const [draftSeconds, setDraftSeconds] = useState<number>();
  const [isAnchored, setIsAnchored] = useState(true);
  const [burst, setBurst] = useState<Reaction>();
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState(
    "/e2e/fixtures/cartoon-media/web/first-steps.mp4",
  );
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    return () => {
      if (source.startsWith("blob:")) {
        URL.revokeObjectURL(source);
      }
    };
  }, [source]);
  useEffect(() => {
    const timer = setTimeout(() => {
      return setBurst(undefined);
    }, 1700);
    return () => {
      return clearTimeout(timer);
    };
  }, [burst]);
  const onSeek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setPosition(seconds);
    }
  };
  const onStart = () => {
    videoRef.current?.pause();
    if (draftSeconds === undefined) {
      setDraftSeconds(videoRef.current?.currentTime ?? position);
    }
  };
  const onComment = () => {
    onStart();
    inputRef.current?.focus();
  };
  const onSubmit = (body: string) => {
    setComments((items) => {
      return [
        ...items,
        {
          id: crypto.randomUUID(),
          name: "Jamie",
          initials: "J",
          body,
          seconds: isAnchored ? (draftSeconds ?? position) : undefined,
          replies: [],
        },
      ].sort((a, b) => {
        return (a.seconds ?? Infinity) - (b.seconds ?? Infinity);
      });
    });
    setDraftSeconds(undefined);
    setNotice("Comment added to this preview.");
  };
  const onReact = (emoji: string) => {
    const reaction = {
      id: crypto.randomUUID(),
      emoji,
      name: "Jamie",
      seconds: videoRef.current?.currentTime ?? position,
    };
    setReactions((items) => {
      return [...items, reaction];
    });
    setBurst(reaction);
    setNotice(`Reacted ${emoji} at ${reaction.seconds.toFixed(1)} seconds.`);
  };
  const onReply = (id: string, body: string) => {
    return setComments((items) => {
      return items.map((item) => {
        return item.id === id
          ? {
              ...item,
              replies: [...item.replies, { id: crypto.randomUUID(), body }],
            }
          : item;
      });
    });
  };
  const onLoadFile = (file: File) => {
    setSource(URL.createObjectURL(file));
    setComments([]);
    setReactions([]);
    setPosition(0);
    setDraftSeconds(undefined);
    setDuration(0);
    setHasError(false);
  };
  const onReset = (empty: boolean) => {
    videoRef.current?.pause();
    onSeek(0);
    setComments(empty ? [] : SAMPLE_COMMENTS);
    setReactions(empty ? [] : SAMPLE_REACTIONS);
    setDraftSeconds(undefined);
    setNotice(
      empty ? "Empty conversation preview." : "Sample conversation restored.",
    );
  };
  return {
    videoRef,
    inputRef,
    position,
    setPosition,
    duration,
    setDuration,
    isPlaying,
    setIsPlaying,
    comments,
    reactions,
    draftSeconds,
    isAnchored,
    setIsAnchored,
    burst,
    notice,
    setNotice,
    source,
    hasError,
    setHasError,
    onSeek,
    onStart,
    onComment,
    onSubmit,
    onReact,
    onReply,
    onLoadFile,
    onReset,
  };
}
/** Shared preview controller, not a production API. */
export type Preview = ReturnType<typeof usePreviewState>;

/** Local-only controller shared by the prototype components. */
export function usePreview(): Preview {
  return usePreviewState();
}
