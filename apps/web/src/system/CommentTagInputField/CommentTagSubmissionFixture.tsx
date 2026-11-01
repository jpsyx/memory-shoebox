import { useCreateComment } from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";
import { useRef, useState, type ReactNode } from "react";
import type { CommentDraft } from "../commentDraftHelpers/commentDraftHelpers";
import { CommentTagInputField } from "./CommentTagInputField";
type Props = { itemId: string };
/** Exercises the actual input with the scoped comment mutation. */
export function CommentTagSubmissionFixture({
  itemId,
}: Readonly<Props>): ReactNode {
  const [value, onChange] = useState<CommentDraft>({
    body: "",
    commentTags: [],
  });
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const writer = useCreateComment(itemId);
  return (
    <CommentTagInputField
      itemId={itemId}
      value={value}
      onChange={onChange}
      fieldRef={fieldRef}
      isSending={writer.isSending}
      onSubmit={() => {
        writer.send({
          draft: value,
          onSent: () => {
            onChange({ body: "", commentTags: [] });
          },
        });
      }}
    />
  );
}
