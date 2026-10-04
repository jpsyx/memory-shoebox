import type { QueryClient } from "@tanstack/react-query";
type Options = {
  queryClient: QueryClient;
  milestoneId: string;
  itemIds?: readonly string[];
  hasMovedItems?: boolean;
};
/** Refreshes occasion/archive reads without recording another item open. */
export async function invalidateMilestoneReads({
  queryClient,
  milestoneId,
  itemIds = [],
  hasMovedItems = false,
}: Readonly<Options>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["milestones"],
      predicate: (query) => {
        const [, kind, , path] = query.queryKey;
        return (
          kind === undefined ||
          kind === "directory" ||
          (typeof path === "string" &&
            path.startsWith(`/milestones/${milestoneId}`))
        );
      },
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["timeline"],
      refetchType: "active",
    }),
    ...(hasMovedItems
      ? [
          queryClient.invalidateQueries({
            queryKey: ["bursts"],
            refetchType: "active",
          }),
        ]
      : []),
    ...itemIds.map((itemId) => {
      return queryClient.invalidateQueries({
        queryKey: ["items", itemId],
        exact: true,
        refetchType: "none",
      });
    }),
  ]);
}
