import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { needsRemovalReconciliation } from "@/api/needsRemovalReconciliation";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  getOwnOpenRequestFromAsk,
  refreshRemovalAskReads,
  type RemovalAskOperation,
} from "./removalAskHelpers";
/** Presentation belongs to one current item/member generation. */
export type RemovalAskState = {
  token: object;
  isPending: boolean;
  error?: string;
  fieldErrors: Record<string, string[]>;
};
/** Sinks captured by ordinary mutation lifecycle handlers. */
export type RemovalAskContext = {
  queryClient: QueryClient;
  targetRef: RefObject<{ key: string; token: object }>;
  setState: Dispatch<SetStateAction<RemovalAskState>>;
  onCreated: (request: RemovalRequestDto) => void;
  blocked: Set<string>;
};

/**
 * Confirmed output is displayed even when the refresh is temporarily
 * unavailable.
 */
export async function completeRemovalAsk({
  context,
  operation,
  request,
}: Readonly<{
  context: RemovalAskContext;
  operation: RemovalAskOperation;
  request: RemovalRequestDto;
}>): Promise<void> {
  await refreshRemovalAskReads({ queryClient: context.queryClient, operation });
  if (context.targetRef.current.token === operation.token) {
    context.setState({
      token: operation.token,
      isPending: false,
      fieldErrors: {},
    });
    context.onCreated(request);
  }
}

/**
 * Refused asks keep words; uncertain asks refresh before a later deliberate
 * write.
 */
export async function reconcileRemovalAsk({
  context,
  operation,
  error,
}: Readonly<{
  context: RemovalAskContext;
  operation: RemovalAskOperation;
  error: unknown;
}>): Promise<void> {
  let hasReadFailed = false;
  if (needsRemovalReconciliation(error)) {
    try {
      const request = await getOwnOpenRequestFromAsk({
        queryClient: context.queryClient,
        operation,
      });
      context.blocked.delete(`${operation.memberId}:${operation.itemId}`);
      if (request !== undefined) {
        await completeRemovalAsk({ context, operation, request });
        return;
      }
    } catch {
      hasReadFailed = true;
      context.blocked.add(`${operation.memberId}:${operation.itemId}`);
    }
  }
  if (context.targetRef.current.token === operation.token) {
    context.setState({
      token: operation.token,
      isPending: false,
      error: hasReadFailed
        ? "We could not confirm this request. Refresh its history before trying again."
        : "We could not record your request. Your words are still here. Check this history before trying again.",
      fieldErrors:
        error instanceof ApiRequestError
          ? (error.details?.fieldErrors ?? {})
          : {},
    });
  }
}
