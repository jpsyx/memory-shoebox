import type { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

const activeTargets: WeakMap<QueryClient, Set<string>> = new WeakMap();

/** Refuses concurrent writes to one occasion across mounted controller lifetimes. */
export async function runMilestoneWrite<Result>({
  queryClient,
  milestoneId,
  write,
}: Readonly<{
  queryClient: QueryClient;
  milestoneId: string;
  write: () => Promise<Result>;
}>): Promise<Result> {
  const targets = activeTargets.get(queryClient) ?? new Set<string>();
  activeTargets.set(queryClient, targets);
  if (targets.has(milestoneId)) {
    throw new ApiRequestError({
      status: 409,
      code: "occasion_busy",
      message:
        "This occasion is already being changed. Wait for that change, then review it before saving again.",
    });
  }
  targets.add(milestoneId);
  try {
    return await write();
  } finally {
    targets.delete(milestoneId);
  }
}
