import type { ReactNode, RefObject } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Composer } from "@/system/Talk/Composer/Composer";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";

type Props = {
  detail: ItemDetail;
  /** On a video, where a new comment is pinned. */
  transport: VideoTransport;
  /** The composer's field, which the thread gives focus to after a delete. */
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * The composer under the thread, sending to this item.
 *
 * On a video, a comment sent while a pin is set stands at that moment. The
 * pin comes off once the comment has landed, never before, so a send that
 * fails keeps it.
 */
export function ItemComposer({
  detail,
  transport,
  fieldRef,
}: Readonly<Props>): ReactNode {
  const { send, isSending, error } = useCreateComment(detail.itemId);
  const isVideo = detail.kind === "video";
  return (
    <Composer
      isSending={isSending}
      error={error}
      fieldRef={fieldRef}
      pinnedAt={isVideo ? transport.pendingAt : undefined}
      onClearPin={() => {
        transport.setPendingAt(undefined);
      }}
      onSend={({ body, onSent }) => {
        const atSeconds = isVideo ? (transport.pendingAt ?? null) : null;
        send({
          draft: { body, atSeconds },
          onSent: () => {
            onSent();
            transport.setPendingAt(undefined);
          },
        });
      }}
    />
  );
}
