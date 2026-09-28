import { Button, Modal, Stack, Textarea } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { agoLabel, clockLabel } from "@/system/labels";
import { Reactions } from "@/system/Reactions";
import { LabelText, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";

type TalkProps = {
  readonly heading: string;
  readonly children: ReactNode;
};

/**
 * The comments panel. Comments are the only social surface in the product, so
 * they get a print ground of their own and real room to read in.
 */
export function Talk({ heading, children }: TalkProps): ReactNode {
  return (
    <section className={classes.talk} aria-label="Comments">
      <LabelText component="h2">{heading}</LabelText>
      {children}
    </section>
  );
}

type CommentRowProps = {
  readonly comment: CommentDto;
  readonly onSeek?: (seconds: number) => void;
};

/**
 * One comment. A pinned one carries a stamp instead of a plain clock time.
 *
 * A comment you wrote yourself carries two more words under it. Editing and
 * deleting are both the author's, because a typo in a message to your family
 * is not something you should have to ask an admin about, and because a
 * comment left in grief at four in the morning is the author's to withdraw.
 *
 * An edit always leaves a mark. A comment that changes under a reader with no
 * sign of it is worse than one that could not change at all.
 */
export function CommentRow({ comment, onSeek }: CommentRowProps): ReactNode {
  const pinnedAt = comment.atSeconds;
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [body, setBody] = useState(comment.body);

  if (isEditing) {
    return (
      <div className={classes.comment}>
        <span className={classes.commentWho}>{comment.author.displayName}</span>
        <span className={classes.commentWhen}>
          {agoLabel(comment.createdAt)}
        </span>
        <Textarea
          value={body}
          autosize
          minRows={2}
          onChange={(event) => {
            return setBody(event.currentTarget.value);
          }}
          classNames={{ input: classes.composerField }}
        />
        <div className={classes.commentOwnActions}>
          <Button
            size="sm"
            onClick={() => {
              return setIsEditing(false);
            }}
          >
            Save the change
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              setBody(comment.body);
              setIsEditing(false);
            }}
          >
            Leave it as it was
          </Button>
          <span className={classes.commentEdited}>
            It will say it was edited.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.comment}>
      <span className={classes.commentWho}>{comment.author.displayName}</span>
      {pinnedAt === null ? (
        <span className={classes.commentWhen}>
          {agoLabel(comment.createdAt)}
        </span>
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
          {clockLabel(pinnedAt)}
          <span className="visually-hidden">
            {` Jump to ${comment.author.displayName}'s comment`}
          </span>
        </button>
      )}
      <p className={classes.commentBody}>
        {body}
        {comment.editedAt === null ? null : (
          <>
            {" "}
            <span className={classes.commentEdited}>
              {`edited ${agoLabel(comment.editedAt)}`}
            </span>
          </>
        )}
      </p>
      <div className={classes.commentReactions}>
        <Reactions reactions={comment.reactions} />
      </div>
      {comment.canEdit || comment.canDelete ? (
        <div className={classes.commentOwnActions}>
          {comment.canEdit ? (
            <button
              type="button"
              className={classes.commentOwnAction}
              onClick={() => {
                return setIsEditing(true);
              }}
            >
              Edit
            </button>
          ) : null}
          {comment.canDelete ? (
            <button
              type="button"
              className={classes.commentOwnAction}
              onClick={() => {
                return setIsDeleting(true);
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}

      <Modal
        opened={isDeleting}
        onClose={() => {
          return setIsDeleting(false);
        }}
        title="Delete what you wrote?"
      >
        <Stack gap="md">
          <Prose>
            It goes, and so does every reaction anybody left on it. The
            photograph stays. Anybody who was emailed this when you sent it
            still has that email, which is not something deleting can reach.
          </Prose>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                return setIsDeleting(false);
              }}
            >
              Delete it
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setIsDeleting(false);
              }}
            >
              Keep it
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </div>
  );
}

type ComposerProps = {
  readonly goesTo: string;
  readonly pinnedAt?: number;
  readonly onClearPin?: () => void;
};

/**
 * The composer. Empty and disabled, typing and enabled, sending, and back to
 * empty: the states a real one needs, because a viewer who cannot work out
 * how to leave a comment is a product failure.
 */
export function Composer({
  goesTo,
  pinnedAt,
  onClearPin,
}: ComposerProps): ReactNode {
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
            : `Say something at ${clockLabel(pinnedAt)}`
        }
        placeholder="Anything at all. They will be glad you did."
        value={body}
        onChange={(event) => {
          return setBody(event.currentTarget.value);
        }}
        classNames={{
          label: classes.composerLabel,
          input: classes.composerField,
        }}
      />
      <div className={classes.composerRow}>
        <Button
          type="submit"
          disabled={!hasText || isSending}
          className={classes.composerSend}
          leftSection={<IconSend {...ICON_PROPS} />}
        >
          {isSending ? "Sending" : "Send"}
        </Button>
        {pinnedAt === undefined ? (
          <span className={classes.composerHint}>{goesTo}</span>
        ) : (
          <>
            <span className={classes.composerHint}>
              {`Pinned to ${clockLabel(pinnedAt)}`}
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
