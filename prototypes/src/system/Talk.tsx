import { Button, Textarea } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { Note } from "@/data/fixtures";
import { LabelText } from "@/system/typography";
import classes from "@/system/system.module.css";

/**
 * The notes panel. Comments are the only social surface in the product, so
 * they get a print ground of their own and real room to read in.
 */
export function Talk({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className={classes.talk} aria-label="Notes">
      <LabelText component="h2">{heading}</LabelText>
      {children}
    </section>
  );
}

/** One note. A pinned one carries a stamp instead of a plain clock time. */
export function NoteRow({
  note,
  onSeek,
}: {
  readonly note: Note;
  readonly onSeek?: (seconds: number) => void;
}): ReactNode {
  const pinnedAt = note.atSeconds;
  return (
    <div className={classes.note}>
      <span className={classes.noteWho}>{note.author}</span>
      {pinnedAt === undefined ? (
        <span className={classes.noteWhen}>{note.when}</span>
      ) : (
        <button
          type="button"
          className={classes.stamp}
          onClick={() => {
            return onSeek?.(pinnedAt);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
          {formatClock(pinnedAt)}
          <span className="visually-hidden">
            {` Jump to ${note.author}'s note`}
          </span>
        </button>
      )}
      <p className={classes.noteBody}>{note.body}</p>
    </div>
  );
}

/** m:ss, which is what a family video is measured in. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The composer. Empty and disabled, typing and enabled, sending, and back to
 * empty: the states a real one needs, because a viewer who cannot work out
 * how to leave a comment is a product failure.
 */
export function Composer({
  goesTo,
  pinnedAt,
  onClearPin,
}: {
  readonly goesTo: string;
  readonly pinnedAt?: number;
  readonly onClearPin?: () => void;
}): ReactNode {
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const hasText = body.trim().length > 0;

  return (
    <form
      className={classes.composer}
      onSubmit={(event) => {
        event.preventDefault();
        setIsSending(true);
        window.setTimeout(() => {
          setIsSending(false);
          setBody("");
        }, 900);
      }}
    >
      <Textarea
        label={
          pinnedAt === undefined
            ? "Say something"
            : `Say something at ${formatClock(pinnedAt)}`
        }
        placeholder="Write to everyone in the circle"
        value={body}
        onChange={(event) => {
          return setBody(event.currentTarget.value);
        }}
      />
      <div className={classes.composerRow}>
        <Button type="submit" disabled={!hasText || isSending}>
          {isSending ? "Sending" : "Send"}
        </Button>
        {pinnedAt === undefined ? (
          <span className={classes.prose}>{goesTo}</span>
        ) : (
          <>
            <span className={classes.prose}>
              {`Pinned to ${formatClock(pinnedAt)}`}
            </span>
            <Button variant="default" size="sm" onClick={onClearPin}>
              Unpin
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
