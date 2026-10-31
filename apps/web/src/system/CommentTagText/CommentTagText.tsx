import type { ReactNode } from "react";
import type { CommentTag } from "@memory-shoebox/shared";
import { makeMemberCollectionHrefFromMemberId } from "@/api/memberCollections/memberCollections";
import classes from "./CommentTagText.module.css";
/** Renders stored references as native links with the posted snapshot wording. */
export function CommentTagText({
  body,
  commentTags,
}: Readonly<{ body: string; commentTags: readonly CommentTag[] }>): ReactNode {
  let cursor = 0;
  const parts = commentTags.flatMap((tag) => {
    const before = body.slice(cursor, tag.start);
    cursor = tag.end;
    return [
      before,
      <a
        key={tag.tagId}
        className={classes.commentTagLink}
        href={makeMemberCollectionHrefFromMemberId(tag.memberId)}
        aria-label={`${tag.label}, view photos and videos`}
      >
        @{tag.label}
      </a>,
    ];
  });
  return (
    <>
      {parts}
      {body.slice(cursor)}
    </>
  );
}
