import { useRouter } from "@tanstack/react-router";
import { useConversationJourney } from "@/session/ConversationJourneyProvider/ConversationJourneyProvider";
import { isSameTabActivation } from "@/session/conversationJourneyHelpers/conversationJourneyHelpers";
import { getConversationReturnFromLink } from "@/session/conversationJourneyHelpers/conversationReturnHelpers";
import type { ReactNode } from "react";
import type { CommentTag } from "@memory-shoebox/shared";
import { makeMemberCollectionHrefFromMemberId } from "@/api/memberCollections/memberCollections";
import classes from "./CommentTagText.module.css";
/** Renders stored references as native links with the posted snapshot wording. */
export function CommentTagText({
  body,
  commentTags,
  itemId,
  commentId,
}: Readonly<{
  body: string;
  commentTags: readonly CommentTag[];
  itemId?: string;
  commentId?: string;
}>): ReactNode {
  const memory = useConversationJourney();
  const router = useRouter({ warn: false });
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
        onClick={(event) => {
          if (!router || !isSameTabActivation(event)) {
            return;
          }
          const returning = getConversationReturnFromLink({
            link: event.currentTarget,
            href: router.state.location.href,
            memberId: tag.memberId,
            itemId,
            commentId,
          });
          if (returning) {
            memory?.rememberReturn(returning);
          }
          event.preventDefault();
          void router.navigate({
            href: makeMemberCollectionHrefFromMemberId(tag.memberId),
          });
        }}
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
