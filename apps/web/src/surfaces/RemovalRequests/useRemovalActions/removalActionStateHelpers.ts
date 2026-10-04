import { MutationObserver, type QueryClient } from "@tanstack/react-query";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { makeWriteScopeFromItemId } from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { removalWriteFailure } from "../removalCopyHelpers/removalCopyHelpers";
import {
  getAuthoritativeRequestFromOperation,
  needsRemovalReconciliation,
  refreshRemovalReads,
  submitRemovalOperation,
  type RemovalOperation,
} from "./removalActionHelpers";

/** Local dialog state, independent of query authority and form text. */
export type RemovalActionState = {
  memberId: string;
  target?: RemovalRequestDto;
  dialog?: "delete" | "decline";
  isPending: boolean;
  error?: string;
  fieldErrors: Record<string, string[]>;
};

/** Captured state sinks and per-member protection shared by operation handlers. */
export type RemovalActionContext = {
  queryClient: QueryClient;
  viewerRef: RefObject<string>;
  activeMembers: Set<string>;
  blockedOperations: Set<string>;
  settledRequests: Set<string>;
  setState: Dispatch<SetStateAction<RemovalActionState>>;
  onItemDeleted?: (itemId: string) => void;
};

/** Success refreshes request reads, with no counted item opens. */
export async function completeRemovalOperation(
  options: Readonly<{
    context: RemovalActionContext;
    operation: RemovalOperation;
  }>,
): Promise<void> {
  const { context, operation } = options;
  context.settledRequests.add(_requestKey(operation));
  await refreshRemovalReads({ queryClient: context.queryClient, operation });
  if (context.viewerRef.current !== operation.viewer.memberId) {
    return;
  }
  context.setState((current) => {
    return {
      ...current,
      target: undefined,
      dialog: undefined,
      isPending: false,
      error: undefined,
      fieldErrors: {},
    };
  });
  if (operation.action === "delete" && operation.request.itemId !== null) {
    context.onItemDeleted?.(operation.request.itemId);
  }
}

/** Refused or uncertain answers retain input and remove stale action authority. */
export async function reconcileRemovalOperation(
  options: Readonly<{
    context: RemovalActionContext;
    operation: RemovalOperation;
    error: unknown;
  }>,
): Promise<void> {
  const { context, operation, error } = options;
  let authority: RemovalRequestDto | undefined;
  let hasReadFailed = false;
  if (needsRemovalReconciliation(error)) {
    try {
      authority = await getAuthoritativeRequestFromOperation({
        queryClient: context.queryClient,
        operation,
      });
      hasReadFailed = authority === undefined;
    } catch {
      hasReadFailed = true;
    }
    if (hasReadFailed) {
      context.blockedOperations.add(_operationKey(operation));
    } else {
      context.blockedOperations.delete(_operationKey(operation));
    }
  }
  if (authority?.state === "deleted" && operation.action === "delete") {
    await completeRemovalOperation({ context, operation });
    return;
  }
  if (authority !== undefined && authority.state !== "open") {
    context.settledRequests.add(_requestKey(operation));
  }
  if (authority !== undefined) {
    await refreshRemovalReads({ queryClient: context.queryClient, operation });
  }
  _showRefusal({ ...options, authority, hasReadFailed });
}

/** A public observer binds scope to each operation before it enters the queue. */
export function submitRemovalAnswer(
  options: Readonly<{
    context: RemovalActionContext;
    operation: RemovalOperation;
  }>,
): void {
  const { context, operation } = options;
  if (
    context.activeMembers.has(operation.viewer.memberId) ||
    context.settledRequests.has(_requestKey(operation))
  ) {
    return;
  }
  context.activeMembers.add(operation.viewer.memberId);
  context.setState((current) => {
    return {
      ...current,
      memberId: operation.viewer.memberId,
      isPending: true,
      error: undefined,
      fieldErrors: {},
    };
  });
  if (context.blockedOperations.has(_operationKey(operation))) {
    void reconcileRemovalOperation({
      ...options,
      error: new Error("Refresh authority"),
    }).finally(() => {
      return context.activeMembers.delete(operation.viewer.memberId);
    });
    return;
  }
  _submitWithObserver(options);
}

function _submitWithObserver(
  options: Readonly<{
    context: RemovalActionContext;
    operation: RemovalOperation;
  }>,
): void {
  const { context, operation } = options;
  const observer = new MutationObserver(context.queryClient, {
    mutationKey: [
      "removal-requests",
      operation.viewer.memberId,
      operation.request.requestId,
      operation.request.itemId,
      operation.action,
    ],
    scope:
      operation.action === "delete" && operation.request.itemId !== null
        ? makeWriteScopeFromItemId(operation.request.itemId)
        : { id: `removal-request:${operation.request.requestId}` },
    retry: false,
    mutationFn: () => {
      return submitRemovalOperation(operation);
    },
    onSuccess: () => {
      return completeRemovalOperation(options);
    },
    onError: (error) => {
      return reconcileRemovalOperation({ ...options, error });
    },
  });
  void observer
    .mutate(undefined)
    .catch(() => {
      return undefined;
    })
    .finally(() => {
      context.activeMembers.delete(operation.viewer.memberId);
      observer.reset();
    });
}

function _operationKey(operation: Readonly<RemovalOperation>): string {
  return `${operation.viewer.memberId}:${operation.request.requestId}:${operation.action}`;
}

function _requestKey(operation: Readonly<RemovalOperation>): string {
  return `${operation.viewer.memberId}:${operation.request.requestId}`;
}

type RefusalPresentation = {
  context: RemovalActionContext;
  operation: RemovalOperation;
  error: unknown;
  authority: RemovalRequestDto | undefined;
  hasReadFailed: boolean;
};

function _showRefusal({
  context,
  operation,
  error,
  authority,
  hasReadFailed,
}: Readonly<RefusalPresentation>): void {
  if (context.viewerRef.current !== operation.viewer.memberId) {
    return;
  }
  context.setState((current) => {
    return {
      ...current,
      target: authority ?? current.target,
      isPending: false,
      error: hasReadFailed
        ? "We could not refresh this request. Its answer is uncertain. Refresh the page before trying again."
        : removalWriteFailure(error),
      fieldErrors:
        error instanceof ApiRequestError
          ? (error.details?.fieldErrors ?? {})
          : {},
    };
  });
}
