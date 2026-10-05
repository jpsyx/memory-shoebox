import { useQuery } from "@tanstack/react-query";

/** Local continuation lock, separate from server group reads and invalidations. */
export const GROUP_CONTINUATION_QUERY_KEY = ["group-continuation"] as const;
/** Other group controls stay disabled until a completed write reconciles authority. */
export function useGroupContinuationGate(): boolean {
  const gate = useQuery({
    queryKey: GROUP_CONTINUATION_QUERY_KEY,
    queryFn: () => {
      return false;
    },
    initialData: false,
    enabled: false,
  });
  return gate.data;
}
