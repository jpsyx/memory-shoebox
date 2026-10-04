import { useMutation } from "@tanstack/react-query";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { createRemovalRequest } from "@/api/removals/removals";
import {
  getOwnOpenRequestFromAsk,
  type RemovalAskOperation,
} from "./removalAskHelpers";
import {
  completeRemovalAsk,
  reconcileRemovalAsk,
  type RemovalAskContext,
} from "./removalAskLifecycleHelpers";
async function _submitAsk({
  context,
  operation,
}: Readonly<{
  context: RemovalAskContext;
  operation: RemovalAskOperation;
}>): Promise<RemovalRequestDto> {
  const key = `${operation.memberId}:${operation.itemId}`;
  if (context.blocked.has(key)) {
    const request = await getOwnOpenRequestFromAsk({
      queryClient: context.queryClient,
      operation,
    });
    context.blocked.delete(key);
    if (request !== undefined) return request;
    throw new Error("Authority refreshed; another deliberate Send is required");
  }
  return createRemovalRequest({
    itemId: operation.itemId,
    body: { reason: operation.reason },
  });
}

/** Ordinary mutation lifecycle bound to captured asking targets. */
export function useRemovalAskMutation({
  context,
  active,
  memberId,
  itemId,
}: Readonly<{
  context: RemovalAskContext;
  active: Set<object>;
  memberId: string;
  itemId: string;
}>): (operation: RemovalAskOperation) => void {
  const key = `${memberId}:${itemId}`;
  const mutation = useMutation({
    mutationKey: ["removal-ask", memberId, itemId],
    retry: false,
    scope: { id: `removal-ask:${key}` },
    mutationFn: (operation: RemovalAskOperation) => {
      return _submitAsk({ context, operation });
    },
    onSuccess: (request, operation) => {
      return completeRemovalAsk({ context, operation, request });
    },
    onError: (error, operation) => {
      return reconcileRemovalAsk({ context, operation, error });
    },
    onSettled: (_data, _error, operation) => {
      active.delete(operation.token);
    },
  });
  return mutation.mutate;
}
