import type { QueryClient } from "@tanstack/react-query";
type Options = {
  queryClient: QueryClient;
  milestoneId: string;
  memberId?: string;
  affectedMilestoneIds?: readonly string[];
  itemIds?: readonly string[];
  hasMovedItems?: boolean;
};
/** Refreshes occasion/archive reads without recording another item open. */
export async function invalidateMilestoneReads({
  queryClient,
  milestoneId,
  memberId,
  affectedMilestoneIds = [],
  itemIds = [],
  hasMovedItems = false,
}: Readonly<Options>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["milestones"],
      predicate: (query) => {
        const [, kind, owner, path] = query.queryKey;
        return (
          kind === undefined ||
          (kind === "directory" &&
            (memberId === undefined || owner === memberId)) ||
          (typeof path === "string" &&
            (memberId === undefined || owner === memberId) &&
            [milestoneId, ...affectedMilestoneIds].some((id) => {
              const target = `/milestones/${id}`;
              return path === target || path.startsWith(`${target}/`);
            }))
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
