import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconMessageCircle,
  IconX,
  IconSend,
  IconClock,
} from "@tabler/icons-react";
import { clockLabel, type TheaterComment, type TheaterDraft } from "./model";
import styles from "./theater.module.css";

type Props = {
  isVideo: boolean;
  comments: TheaterComment[];
  draft: TheaterDraft;
  onDraft: (draft: TheaterDraft) => void;
  onSend: (comment: TheaterComment) => void;
  onCapture: () => number;
  onSeek: (seconds: number) => void;
};
/** A single corner surface morphs between a bubble and its conversation. */
export function CommentDock(props: Readonly<Props>): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const { body, atSeconds, hasCaptured } = props.draft;
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const clearClose = () => {
    return clearTimeout(closeTimer.current);
  };
  const close = () => {
    clearClose();
    setIsOpen(false);
    if (root.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
  };
  const open = () => {
    clearClose();
    setIsOpen(true);
  };
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(close, 450);
  };
  const capture = () => {
    const position = props.onCapture();
    if (!hasCaptured) {
      props.onDraft({
        ...props.draft,
        hasCaptured: true,
        atSeconds: position < 1 ? undefined : position,
      });
    }
  };
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      return input.current?.focus({ preventScroll: true });
    }, 180);
    return () => {
      return clearTimeout(timer);
    };
  }, [isOpen]);
  useEffect(() => {
    return () => {
      return clearTimeout(closeTimer.current);
    };
  }, []);
  const submit = () => {
    if (!body.trim()) return;
    props.onSend({
      id: crypto.randomUUID(),
      author: "You",
      body: body.trim(),
      atSeconds: props.isVideo ? atSeconds : undefined,
    });
    props.onDraft({ body: "", hasCaptured: false });
    input.current?.focus();
  };
  return (
    <div
      ref={root}
      className={styles.commentDock}
      data-open={isOpen}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") open();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") scheduleClose();
      }}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !event.currentTarget.matches(":hover")
        )
          scheduleClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        className={styles.commentBubble}
        aria-label={`Open comments (${props.comments.length})`}
        aria-expanded={isOpen}
        aria-controls="theater-comments"
        tabIndex={isOpen ? -1 : 0}
        onClick={open}
        onFocus={open}
      >
        <IconMessageCircle />
        <span>{props.comments.length}</span>
      </button>
      <section
        id="theater-comments"
        className={styles.commentPanel}
        aria-label="Comments"
        inert={!isOpen}
        aria-hidden={!isOpen}
      >
        <header>
          <h2>
            Comments <span>{props.comments.length}</span>
          </h2>
          <button aria-label="Close comments" onClick={close}>
            <IconX />
          </button>
        </header>
        <div className={styles.commentList} aria-live="polite">
          {props.comments.length ? (
            props.comments.map((comment) => {
              return (
                <article key={comment.id}>
                  <span className={styles.avatar}>
                    {comment.author.charAt(0)}
                  </span>
                  <div>
                    <div className={styles.commentByline}>
                      <strong>{comment.author}</strong>
                      {comment.atSeconds !== undefined ? (
                        <button
                          onClick={() => {
                            return props.onSeek(comment.atSeconds!);
                          }}
                        >
                          {clockLabel(comment.atSeconds)}
                        </button>
                      ) : null}
                    </div>
                    <p>{comment.body}</p>
                  </div>
                </article>
              );
            })
          ) : (
            <p className={styles.emptyComments}>
              Some moments are better with a few words.
              <br />
              Leave the first comment.
            </p>
          )}
        </div>
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={input}
            aria-label="Write a comment"
            placeholder="Say something about this moment…"
            value={body}
            onChange={(event) => {
              return props.onDraft({
                ...props.draft,
                body: event.target.value,
              });
            }}
            onFocus={capture}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className={styles.composerActions}>
            {props.isVideo ? (
              <button
                type="button"
                className={styles.timestamp}
                aria-label={
                  atSeconds === undefined
                    ? "Whole video; attach current moment"
                    : `Comment at ${clockLabel(atSeconds)}; switch to whole video`
                }
                onClick={() => {
                  const position = props.onCapture();
                  props.onDraft({
                    ...props.draft,
                    hasCaptured: true,
                    atSeconds:
                      atSeconds === undefined && position >= 1
                        ? position
                        : undefined,
                  });
                }}
              >
                <IconClock />
                {atSeconds === undefined
                  ? "Whole video"
                  : clockLabel(atSeconds)}
                {atSeconds === undefined ? null : <IconX />}
              </button>
            ) : (
              <span>Just our circle</span>
            )}
            <button
              type="submit"
              className={styles.sendButton}
              aria-label="Post comment"
              disabled={!body.trim()}
            >
              <IconSend />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
