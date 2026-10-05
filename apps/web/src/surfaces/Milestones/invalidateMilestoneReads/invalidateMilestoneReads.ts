import type { QueryClient } from "@tanstack/react-query";
type Options = {
  queryClient: QueryClient;
  milestoneId: string;
  memberId?: string;
  affectedMilestoneIds?: string[];
  itemIds?: string[];
  hasMovedItems?: boolean;
};
function _isAffectedMilestoneQuery({
  queryKey,
  memberId,
  milestoneIds,
}: Readonly<{
  queryKey: readonly unknown[];
  memberId?: string;
  milestoneIds: readonly string[];
}>): boolean {
  const [, kind, owner, path] = queryKey;
  return (
    kind === undefined ||
    (kind === "directory" && (memberId === undefined || owner === memberId)) ||
    (typeof path === "string" &&
      (memberId === undefined || owner === memberId) &&
      milestoneIds.some((targetMilestoneId) => {
        const target = `/milestones/${targetMilestoneId}`;
        return path === target || path.startsWith(`${target}/`);
      }))
  );
}
function _getItemInvalidationsFromItemIds({
  queryClient,
  itemIds,
}: Readonly<{
  queryClient: QueryClient;
  itemIds: readonly string[];
}>): Array<Promise<void>> {
  return itemIds.map((itemId) => {
    return queryClient.invalidateQueries({
      queryKey: ["items", itemId],
      exact: true,
      refetchType: "none",
    });
  });
}
/** Refreshes occasion/archive reads without recording another item open. */
export async function invalidateMilestoneReads({
  queryClient,
  milestoneId,
  memberId,
  affectedMilestoneIds = [],
  itemIds = [],
  hasMovedItems = false,
}: Readonly<
  Omit<Options, "affectedMilestoneIds" | "itemIds"> & {
    affectedMilestoneIds?: readonly string[];
    itemIds?: readonly string[];
  }
>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["milestones"],
      predicate: (query) => {
        return _isAffectedMilestoneQuery({
          queryKey: query.queryKey,
          memberId,
          milestoneIds: [milestoneId, ...affectedMilestoneIds],
        });
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
    ..._getItemInvalidationsFromItemIds({ queryClient, itemIds }),
  ]);
}
