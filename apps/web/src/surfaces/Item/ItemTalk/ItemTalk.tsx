import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Composer } from "@/system/Talk/Composer";
import { Talk } from "@/system/Talk/Talk";
import { Prose } from "@/system/typography/Prose";
import {
  COMPOSER_HINT,
  commentsHeading,
  quietThreadProse,
} from "@/surfaces/Item/itemCopy/itemCopy";
import { ItemComment } from "@/surfaces/Item/ItemTalk/ItemComment";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useConversation";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * The thread and its composer.
 *
 * With nothing said, the composer is the surface rather than an afterthought
 * under an empty list: the panel says plainly that anybody who can see it can
 * be the first, and the field is right there.
 */
export function ItemTalk({ detail, viewer }: Readonly<Props>): ReactNode {
  const { send, isSending, error } = useCreateComment(detail.itemId);
  return (
    <Talk heading={commentsHeading(detail)}>
      {detail.comments.length === 0 ? (
        <Prose>{quietThreadProse(detail.kind)}</Prose>
      ) : (
        detail.comments.map((comment) => {
          return (
            <ItemComment
              key={comment.commentId}
              itemId={detail.itemId}
              comment={comment}
              viewer={viewer}
            />
          );
        })
      )}
      <Composer
        goesTo={COMPOSER_HINT}
        isSending={isSending}
        error={error}
        onSend={(body, onSent) => {
          send({ body, atSeconds: null }, onSent);
        }}
      />
    </Talk>
  );
}
