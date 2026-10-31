import { Button } from "@mantine/core";
import type { MemberRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { CommentTagFailure } from "@/api/comments/comments";
import {
  makeCommentDraftFromEdit,
  type CommentDraft,
} from "../commentDraftHelpers/commentDraftHelpers";
import classes from "./CommentTagInputField.module.css";
type Props = {
  value: CommentDraft;
  index: number;
  failure: CommentTagFailure;
  member?: MemberRef;
  onChange: (value: CommentDraft, caret: number) => void;
};
/** One refused occurrence, with explicit repair choices that retain the words. */
export function CommentTagCorrection(props: Readonly<Props>): ReactNode {
  const { failure, member } = props;
  const actions = _getCorrectionActions(props);
  const canUpdate =
    failure.code === "comment_tag_stale" &&
    member &&
    member.displayName !== failure.label;
  return (
    <div className={classes.correction} role="alert">
      <p>
        {canUpdate
          ? `This member is now called ${member.displayName}.`
          : `${failure.label} can't be tagged here now.`}
      </p>
      {canUpdate ? (
        <Button variant="subtle" onClick={actions.update}>
          Use updated name
        </Button>
      ) : null}
      <Button variant="subtle" onClick={actions.keepPlain}>
        Keep as plain text
      </Button>
      <Button variant="subtle" onClick={actions.choose}>
        Choose another member
      </Button>
    </div>
  );
}
function _getCorrectionActions({
  value,
  index,
  member,
  onChange,
}: Readonly<Props>) {
  const tag = value.commentTags[index];
  return {
    keepPlain: () => {
      if (tag) {
        onChange(
          {
            ...value,
            commentTags: value.commentTags.filter((_, tagIndex) => {
              return tagIndex !== index;
            }),
          },
          tag.end,
        );
      }
    },
    choose: () => {
      if (tag) {
        onChange(
          makeCommentDraftFromEdit({
            draft: value,
            start: tag.start,
            end: tag.end,
            text: "@",
          }),
          tag.start + 1,
        );
      }
    },
    update: () => {
      _updateName({ value, index, member, onChange });
    },
  };
}

function _updateName({
  value,
  index,
  member,
  onChange,
}: Readonly<Omit<Props, "failure">>): void {
  const tag = value.commentTags[index];
  if (!tag || !member) {
    return;
  }
  const text = `@${member.displayName}`;
  const draft = makeCommentDraftFromEdit({
    draft: value,
    start: tag.start,
    end: tag.end,
    text,
  });
  onChange(
    {
      ...draft,
      commentTags: [
        ...draft.commentTags,
        {
          memberId: member.memberId,
          start: tag.start,
          end: tag.start + text.length,
        },
      ].sort((left, right) => {
        return left.start - right.start;
      }),
    },
    tag.start + text.length,
  );
}
