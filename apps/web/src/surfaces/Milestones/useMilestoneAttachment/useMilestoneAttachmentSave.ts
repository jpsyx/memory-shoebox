import { runMilestoneWrite } from "../runMilestoneWrite";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  MilestoneDetail,
  SetMilestoneItemsResponse,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { setMilestoneItems } from "@/api/milestoneHelpers/milestoneItemsHelpers";
import { milestoneDetailQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { invalidateMilestoneReads } from "../invalidateMilestoneReads/invalidateMilestoneReads";
import { getMilestoneItemDeltaFromChoices } from "../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
import { getMilestoneRecoveryBaselineFromItemIds } from "./getMilestoneRecoveryBaselineFromItemIds";
import type {
  AttachmentSubmission,
  MilestoneAttachmentOptions,
} from "./useMilestoneAttachment.types";
type SaveResult = MilestoneDetail | SetMilestoneItemsResponse;
type SaveState = {
  error: string | undefined;
  savedDetail: MilestoneDetail | undefined;
  savedCounts: { attachedCount: number; detachedCount: number } | undefined;
};
type WriteGuard = {
  isLocked: boolean;
  isMounted: boolean;
  pending: Set<string>;
  hasStartedWrite: boolean;
  identity: string;
};
type SaveContext = {
  options: MilestoneAttachmentOptions;
  current: { current: MilestoneAttachmentOptions };
  guard: WriteGuard;
  queryClient: QueryClient;
  setState: (updater: (state: SaveState) => SaveState) => void;
};
function _isCurrentAttachment(context: Readonly<SaveContext>): boolean {
  const current = context.current.current;
  return (
    context.guard.isMounted &&
    context.guard.identity ===
      `${current.viewer.memberId}:${current.detail.milestone.milestoneId}`
  );
}
function _hasUsableAttachmentAuthority(
  context: Readonly<SaveContext>,
): boolean {
  const query = milestoneDetailQueryOptions({
    memberId: context.options.viewer.memberId,
    milestoneId: context.options.detail.milestone.milestoneId,
  });
  const authority = context.queryClient.getQueryState<MilestoneDetail>(
    query.queryKey,
  );
  return (
    authority?.status === "success" &&
    authority.fetchStatus === "idle" &&
    authority.data?.canEdit === true &&
    context.current.current.detail.canEdit
  );
}
async function _saveAttachmentFromSnapshot(
  context: Readonly<SaveContext>,
  snapshot: Readonly<AttachmentSubmission>,
): Promise<SaveResult> {
  const milestoneId = context.options.detail.milestone.milestoneId;
  context.guard.hasStartedWrite = false;
  const authority = await context.queryClient.fetchQuery({
    ...milestoneDetailQueryOptions({
      memberId: context.options.viewer.memberId,
      milestoneId,
    }),
    staleTime: 0,
    retry: false,
  });
  let delta = snapshot.delta;
  if (context.guard.pending.size > 0) {
    const pending = new Set([
      ...context.guard.pending,
      ...delta.attach,
      ...delta.detach,
    ]);
    const baseline = await getMilestoneRecoveryBaselineFromItemIds({
      milestoneId,
      pending,
    });
    delta = getMilestoneItemDeltaFromChoices({
      baseline,
      chosen: snapshot.chosen,
    });
  }
  if (
    !_isCurrentAttachment(context) ||
    !_hasUsableAttachmentAuthority(context)
  ) {
    throw new Error(
      "Refresh the occasion before saving. Your choices are kept.",
    );
  }
  if (delta.attach.length === 0 && delta.detach.length === 0) {
    return authority;
  }
  context.guard.hasStartedWrite = true;
  return setMilestoneItems({ milestoneId, body: delta });
}
function _confirmAttachmentSave(
  context: Readonly<SaveContext>,
  detail: SaveResult,
  snapshot: Readonly<AttachmentSubmission>,
): void {
  if (_isCurrentAttachment(context)) {
    context.setState((state) => {
      return {
        ...state,
        savedDetail: detail,
        savedCounts:
          "attachedCount" in detail
            ? {
                attachedCount: detail.attachedCount,
                detachedCount: detail.detachedCount,
              }
            : undefined,
      };
    });
  }
  void invalidateMilestoneReads({
    queryClient: context.queryClient,
    milestoneId: context.options.detail.milestone.milestoneId,
    itemIds: [...snapshot.chosen.keys()],
  }).catch(() => {});
}
function _refuseAttachmentSave(
  context: Readonly<SaveContext>,
  failure: Error,
  snapshot: Readonly<AttachmentSubmission>,
): void {
  const isUncertain =
    context.guard.hasStartedWrite &&
    (!(failure instanceof ApiRequestError) || failure.status >= 500);
  if (isUncertain) {
    context.guard.pending = new Set([
      ...context.guard.pending,
      ...snapshot.delta.attach,
      ...snapshot.delta.detach,
    ]);
  }
  if (_isCurrentAttachment(context)) {
    context.setState((state) => {
      return {
        ...state,
        error:
          context.guard.pending.size > 0 && context.guard.hasStartedWrite
            ? "The save could not be confirmed. Your choices are kept. Save again to read their current attachments before any retry."
            : failure.message,
      };
    });
  }
}
function _getAttachmentMutationOptions(
  context: Readonly<SaveContext>,
): UseMutationOptions<SaveResult, Error, AttachmentSubmission> {
  return {
    retry: false,
    mutationFn: (snapshot) => {
      return runMilestoneWrite({
        queryClient: context.queryClient,
        milestoneId: context.options.detail.milestone.milestoneId,
        write: () => {
          return _saveAttachmentFromSnapshot(context, snapshot);
        },
      });
    },
    onSuccess: (detail, snapshot) => {
      _confirmAttachmentSave(context, detail, snapshot);
    },
    onError: (failure, snapshot) => {
      _refuseAttachmentSave(context, failure, snapshot);
    },
    onSettled: () => {
      context.guard.isLocked = false;
    },
  };
}
function _submitAttachmentSnapshot(
  options: Readonly<{
    context: SaveContext;
    state: SaveState;
    snapshot: AttachmentSubmission;
    mutate: (snapshot: AttachmentSubmission) => void;
  }>,
): void {
  const { context, state, snapshot, mutate } = options;
  if (
    context.guard.isLocked ||
    state.savedDetail !== undefined ||
    !_isCurrentAttachment(context)
  ) {
    return;
  }
  if (
    context.current.current.hasUsableAuthority === false ||
    !context.current.current.detail.canEdit
  ) {
    context.setState((previous) => {
      return {
        ...previous,
        error: "Refresh the occasion before saving. Your choices are kept.",
      };
    });
    return;
  }
  if (
    snapshot.delta.attach.length === 0 &&
    snapshot.delta.detach.length === 0 &&
    context.guard.pending.size === 0
  ) {
    context.setState((previous) => {
      return { ...previous, savedDetail: context.current.current.detail };
    });
    return;
  }
  context.guard.isLocked = true;
  context.setState((previous) => {
    return { ...previous, error: undefined };
  });
  mutate(snapshot);
}
function _makeGuardFromOptions(
  options: Readonly<MilestoneAttachmentOptions>,
): WriteGuard {
  return {
    isLocked: false,
    isMounted: true,
    pending: new Set(),
    hasStartedWrite: false,
    identity: `${options.viewer.memberId}:${options.detail.milestone.milestoneId}`,
  };
}
type SaveController = SaveState & {
  save: (snapshot: AttachmentSubmission) => void;
  isPending: boolean;
  setError: (error: string | undefined) => void;
};
/** Refreshes authority and reconciles uncertain intent before explicit writes. */
export function useMilestoneAttachmentSave(
  options: Readonly<MilestoneAttachmentOptions>,
): SaveController {
  const queryClient = useQueryClient();
  const current = useRef(options);
  current.current = options;
  const guard = useRef(_makeGuardFromOptions(options));
  const [state, setState] = useState<SaveState>({
    error: undefined,
    savedDetail: undefined,
    savedCounts: undefined,
  });
  useEffect(function trackAttachmentLifetime() {
    const lifetime = guard.current;
    lifetime.isMounted = true;
    return () => {
      lifetime.isMounted = false;
    };
  }, []);
  const context = {
    queryClient,
    current,
    guard: guard.current,
    options,
    setState,
  };
  const mutation = useMutation(_getAttachmentMutationOptions(context));
  const setError = (error: string | undefined) => {
    setState((previous) => {
      return { ...previous, error };
    });
  };
  const save = (snapshot: AttachmentSubmission) => {
    _submitAttachmentSnapshot({
      context,
      state,
      snapshot,
      mutate: mutation.mutate,
    });
  };
  return { ...state, save, isPending: mutation.isPending, setError };
}
