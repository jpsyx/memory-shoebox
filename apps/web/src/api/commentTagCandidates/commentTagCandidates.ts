import { queryOptions } from "@tanstack/react-query";
import {
  commentTagCandidatesResponseSchema,
  type CommentTagCandidatesResponse,
} from "@memory-shoebox/shared";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";
import { makeItemPathFromItemId } from "@/api/items/items";
/** Eligible candidates keyed by item and the current query, never prior results. */
export function commentTagCandidatesQueryOptions(
  options: Readonly<{ itemId: string; query: string }>,
): ReturnType<
  typeof queryOptions<
    CommentTagCandidatesResponse,
    Error,
    CommentTagCandidatesResponse,
    string[]
  >
> {
  return queryOptions({
    queryKey: ["comment-tag-candidates", options.itemId, options.query],
    queryFn: ({ signal }) => {
      return apiFetch({
        path: `${makeItemPathFromItemId(options.itemId)}/comment-tag-candidates?${new URLSearchParams({ q: options.query })}`,
        schema: commentTagCandidatesResponseSchema,
        init: { signal },
      });
    },
    staleTime: 0,
    retry: false,
  });
}
