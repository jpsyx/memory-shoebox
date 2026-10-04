import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { MilestoneListResponse } from "./milestoneHelpers.types";
import { milestoneListResponseSchema } from "./milestoneSchemas.constants";

async function _getMilestoneListFromCursor(
  options: Readonly<{ cursor?: string; seen: ReadonlySet<string> }>,
): Promise<MilestoneListResponse> {
  const searchParams = new URLSearchParams();
  if (options.cursor !== undefined) {
    searchParams.set("cursor", options.cursor);
  }
  const page = await apiFetch({
    path: makePathFromSearchParams({ basePath: "/milestones", searchParams }),
    schema: milestoneListResponseSchema,
  });
  if (page.nextCursor === null) {
    return page;
  }
  if (options.seen.has(page.nextCursor)) {
    throw new Error("The milestone directory repeated a page. Retry the list.");
  }
  const remaining = await _getMilestoneListFromCursor({
    cursor: page.nextCursor,
    seen: new Set([...options.seen, page.nextCursor]),
  });
  return {
    milestones: [...page.milestones, ...remaining.milestones],
    nextCursor: null,
  };
}
/** The complete occasion directory, following every opaque cursor. */
export function milestonesQueryOptions(): ReturnType<
  typeof queryOptions<
    MilestoneListResponse,
    Error,
    MilestoneListResponse,
    string[]
  >
> {
  return queryOptions({
    queryKey: ["milestones"],
    queryFn: () => {
      return _getMilestoneListFromCursor({ seen: new Set() });
    },
    retry: false,
  });
}
/** Refreshes inactive occasion and archive reads after upload changes. */
export async function invalidateUploadMilestoneQueries(
  client: QueryClient,
): Promise<void> {
  await Promise.all([
    client.invalidateQueries({
      queryKey: ["timeline"],
      refetchType: "inactive",
    }),
    client.invalidateQueries({
      queryKey: ["milestones"],
      refetchType: "inactive",
    }),
  ]);
}
