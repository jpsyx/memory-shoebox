import { useQuery } from "@tanstack/react-query";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { commentTagCandidatesQueryOptions } from "@/api/commentTagCandidates/commentTagCandidates";
import {
  getFailedCommentTagsFromDraft,
  type CommentTagFailure,
} from "@/api/comments/comments";
import type { CommentDraft } from "../commentDraftHelpers/commentDraftHelpers";
import { CommentTagCorrection } from "./CommentTagCorrection";
type Props = {
  itemId: string;
  value: CommentDraft;
  failures: readonly CommentTagFailure[];
  onChange: (value: CommentDraft, caret: number) => void;
};
/** Refreshes eligible names for explicit, per-occurrence refusal recovery. */
export function CommentTagCorrections({
  itemId,
  value,
  failures,
  onChange,
}: Readonly<Props>): ReactNode {
  const affected = getFailedCommentTagsFromDraft({ draft: value, failures });
  const candidates = useQuery({
    ...commentTagCandidatesQueryOptions({ itemId, query: "" }),
    enabled: affected.length > 0,
  });
  return (
    <>
      {affected.map(({ index, failure }) => {
        const member = candidates.data?.members.find((candidate) => {
          return candidate.memberId === failure.memberId;
        });
        return (
          <CommentTagCorrection
            key={`${index}-${failure.memberId}`}
            value={value}
            index={index}
            failure={failure}
            member={member}
            onChange={onChange}
          />
        );
      })}
      {affected.length > 0 && candidates.isError ? (
        <Button
          variant="subtle"
          onClick={() => {
            void candidates.refetch();
          }}
        >
          Retry
        </Button>
      ) : null}
    </>
  );
}
