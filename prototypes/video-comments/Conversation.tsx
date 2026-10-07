import React, { useState } from "react";
import {
  IconClock,
  IconSend,
  IconX,
  IconMessageCircle,
  IconHeart,
} from "@tabler/icons-react";
import { makeTimestampFromSeconds as stamp, type Comment } from "./model";

type Props = {
  comments: readonly Comment[];
  onSeek: (seconds: number) => void;
  onReply: (id: string, body: string) => void;
};
/** Sidebar threads preserve the moment even when the viewer seeks elsewhere. */
export function Conversation({
  comments,
  onSeek,
  onReply,
}: Props): React.ReactNode {
  return (
    <div className="threads" aria-label="Video comments">
      <div className="thread-heading">
        {comments.length} {comments.length === 1 ? "comment" : "comments"}
        <span>In video order</span>
      </div>
      {!comments.length && (
        <div className="empty">
          <IconMessageCircle size={32} />
          <h3>Be the first to say something</h3>
          <p>
            Pause on a moment you love, or leave a note about the whole video.
          </p>
        </div>
      )}
      {comments.map((comment) => {
        return (
          <CommentThread
            key={comment.id}
            comment={comment}
            onSeek={onSeek}
            onReply={onReply}
          />
        );
      })}
    </div>
  );
}

function CommentThread({
  comment,
  onSeek,
  onReply,
}: { comment: Comment } & Omit<Props, "comments">) {
  const [isReplying, setIsReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [hasHeart, setHasHeart] = useState(false);
  return (
    <article className="thread">
      <div className={`avatar avatar-${comment.initials.toLowerCase()}`}>
        {comment.initials}
      </div>
      <div className="thread-body">
        <div className="byline">
          <strong>{comment.name}</strong>
          {comment.seconds !== undefined && (
            <button
              className="timestamp"
              onClick={() => {
                return onSeek(comment.seconds!);
              }}
              aria-label={`Seek to ${stamp(comment.seconds)}`}
            >
              {stamp(comment.seconds)}
            </button>
          )}
          <span>Just now</span>
        </div>
        <p>{comment.body}</p>
        <div className="thread-actions">
          <button
            onClick={() => {
              return setIsReplying(!isReplying);
            }}
          >
            Reply
          </button>
          <button
            className={hasHeart ? "hearted" : ""}
            aria-pressed={hasHeart}
            aria-label={`Like ${comment.name}'s comment`}
            onClick={() => {
              return setHasHeart(!hasHeart);
            }}
          >
            <IconHeart size={16} fill={hasHeart ? "currentColor" : "none"} />{" "}
            {hasHeart ? "1" : ""}
          </button>
        </div>
        {comment.replies.map((replyItem) => {
          return (
            <div className="reply" key={replyItem.id}>
              <div className="avatar avatar-j">J</div>
              <div>
                <strong>Jamie</strong>
                <p>{replyItem.body}</p>
              </div>
            </div>
          );
        })}
        {isReplying && (
          <form
            className="reply-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (reply.trim()) {
                onReply(comment.id, reply.trim());
                setReply("");
                setIsReplying(false);
              }
            }}
          >
            <input
              autoFocus
              aria-label={`Reply to ${comment.name}`}
              value={reply}
              onChange={(event) => {
                return setReply(event.target.value);
              }}
              placeholder="Write a reply…"
            />
            <button disabled={!reply.trim()} aria-label="Send reply">
              <IconSend size={17} />
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

type ComposerProps = {
  seconds?: number;
  isAnchored: boolean;
  onStart: () => void;
  onToggleAnchor: () => void;
  onSubmit: (body: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
};
/** A draft captures its timestamp on focus, rather than drifting with playback. */
export function Composer({
  seconds,
  isAnchored,
  onStart,
  onToggleAnchor,
  onSubmit,
  inputRef,
}: ComposerProps): React.ReactNode {
  const [body, setBody] = useState("");
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim()) {
          onSubmit(body.trim());
          setBody("");
        }
      }}
    >
      <div className="composer-input">
        <div className="avatar avatar-j">J</div>
        <textarea
          ref={inputRef}
          rows={2}
          aria-label="Write a comment"
          placeholder="Say something about this moment…"
          value={body}
          onFocus={onStart}
          onChange={(event) => {
            return setBody(event.target.value);
          }}
        />
      </div>
      <div className="composer-actions">
        <button
          type="button"
          className={`anchor-toggle ${isAnchored ? "anchored" : ""}`}
          aria-pressed={isAnchored}
          onClick={onToggleAnchor}
        >
          <IconClock size={15} />
          {isAnchored ? stamp(seconds ?? 0) : "Whole video"}
          {isAnchored && <IconX size={12} />}
        </button>
        <button
          className="send"
          disabled={!body.trim()}
          type="submit"
          aria-label="Post comment"
        >
          <IconSend size={17} />
        </button>
      </div>
    </form>
  );
}
