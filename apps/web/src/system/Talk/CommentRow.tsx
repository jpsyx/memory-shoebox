import { Button, Modal, Stack, Textarea } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { agoLabel, clockLabel } from "@/system/labelHelpers/labelHelpers";
import { Reactions } from "@/system/Reactions/Reactions";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  /** Who is looking, so a reaction answers before the server hears about it. */
  viewer: MemberRef;
  comment: CommentDto;
  onSeek?: (seconds: number) => void;
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
export function CommentRow({
  comment,
  viewer,
  onSeek,
}: Readonly<Props>): ReactNode {
  const pinnedAt = comment.atSeconds;
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [body, setBody] = useState(comment.body);

  // `canEdit` is re-read rather than trusted from the moment Edit was
  // pressed: a refetch can take the right away underneath somebody who is
  // mid-sentence, and leaving the form up would offer a save the server is
  // going to refuse.
  if (isEditing && comment.canEdit) {
    return (
      <div className={classes.comment}>
        <span className={classes.commentWho}>{comment.author.displayName}</span>
        <span className={classes.commentWhen}>
          {agoLabel({ timestamp: comment.createdAt })}
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
          {agoLabel({ timestamp: comment.createdAt })}
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
              {`edited ${agoLabel({ timestamp: comment.editedAt })}`}
            </span>
          </>
        )}
      </p>
      <div className={classes.commentReactions}>
        <Reactions reactions={comment.reactions} viewer={viewer} />
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
