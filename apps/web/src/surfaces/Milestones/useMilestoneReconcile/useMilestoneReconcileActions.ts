import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useState } from "react";
import type {
  MilestoneDetail,
  MilestoneRef,
  ReconcileMilestoneResponse,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { reconcileMilestone } from "@/api/milestoneHelpers/milestoneItemsHelpers";
import { updateMilestone } from "@/api/milestoneHelpers/milestoneHelpers";
import { invalidateMilestoneReads } from "../invalidateMilestoneReads/invalidateMilestoneReads";
import { getMilestoneFieldErrorsFromMoves } from "../milestoneReconcileHelpers/milestoneReconcileHelpers";
import type {
  ReconcileOptions,
  ReconcileActions,
  ReconcileReads,
  ReconcileGuard,
  ReconcileState,
  ReconcileSubmission,
} from "./useMilestoneReconcile.types";
import { useMilestoneReconcileLifetime } from "./useMilestoneReconcileLifetime";
import type { useMilestoneReconcileReads } from "./useMilestoneReconcileReads";
type Reads = ReturnType<typeof useMilestoneReconcileReads>;
type Context = {
  options: ReconcileOptions;
  current: { current: ReconcileOptions };
  guard: ReconcileGuard;
  reads: Reads;
  setState: (update: (state: ReconcileState) => ReconcileState) => void;
};
function _isCurrentReconcile(context: Readonly<Context>): boolean {
  const current = context.current.current;
  return (
    context.guard.isMounted &&
    context.guard.identity ===
      `${current.viewer.memberId}:${current.detail.milestone.milestoneId}`
  );
}
function _hasCurrentReconcileAuthority(
  context: Readonly<Context>,
  milestone: MilestoneRef,
): boolean {
  const detailState = context.reads.queryClient.getQueryState<MilestoneDetail>(
    context.reads.detailQueryOptions.queryKey,
  );
  const mismatchState = context.reads.queryClient.getQueryState(
    context.reads.mismatchesOptions.queryKey,
  );
  return (
    _isCurrentReconcile(context) &&
    context.current.current.detail.canEdit &&
    detailState?.status === "success" &&
    detailState.fetchStatus === "idle" &&
    detailState.data?.canEdit === true &&
    detailState.data.milestone.startsOn === milestone.startsOn &&
    detailState.data.milestone.endsOn === milestone.endsOn &&
    mismatchState?.status === "success" &&
    mismatchState.fetchStatus === "idle"
  );
}
function _hasReconcilePreflightChanged({
  fresh,
  snapshot,
}: Readonly<{
  fresh: Awaited<ReturnType<ReconcileReads["refresh"]>>;
  snapshot: ReconcileSubmission;
}>): boolean {
  const milestone = fresh.detail.milestone;
  const pendingIds = new Set(
    fresh.pages.pages.flatMap((page) => {
      return page.mismatches.map(({ item }) => {
        return item.itemId;
      });
    }),
  );
  const serverSpan = fresh.pages.pages[0]?.wideningSpan;
  const hasChangedWidening =
    snapshot.action === "widen" &&
    "startsOn" in snapshot.body &&
    (snapshot.body.startsOn !== serverSpan?.startsOn ||
      snapshot.body.endsOn !== serverSpan?.endsOn);
  return (
    milestone.startsOn !== snapshot.milestone.startsOn ||
    milestone.endsOn !== snapshot.milestone.endsOn ||
    hasChangedWidening ||
    snapshot.itemIds.some((id) => {
      return !pendingIds.has(id);
    }) ||
    fresh.pages.pages.some((page) => {
      return (
        page.milestone.startsOn !== milestone.startsOn ||
        page.milestone.endsOn !== milestone.endsOn
      );
    })
  );
}
async function _writeReconcileFromSubmission(
  context: Readonly<Context>,
  snapshot: Readonly<ReconcileSubmission>,
): Promise<MilestoneDetail | ReconcileMilestoneResponse> {
  context.guard.hasWritten = false;
  const fresh = await context.reads.refresh();
  if (_hasReconcilePreflightChanged({ fresh, snapshot })) {
    throw new Error(
      "The occasion or its attachments changed. Review the refreshed photographs before choosing again.",
    );
  }
  if (!_hasCurrentReconcileAuthority(context, snapshot.milestone)) {
    throw new Error("Refresh the occasion before saving. Your dates are kept.");
  }
  const milestoneId = snapshot.milestone.milestoneId;
  context.guard.hasWritten = true;
  if (snapshot.action === "widen") {
    return updateMilestone({
      milestoneId,
      body: fresh.pages.pages[0]!.wideningSpan,
    });
  }
  if (!("mode" in snapshot.body)) {
    throw new Error("Choose a reconciliation action.");
  }
  return reconcileMilestone({ milestoneId, body: snapshot.body });
}
function _confirmReconcile(
  context: Readonly<Context>,
  response: MilestoneDetail | ReconcileMilestoneResponse,
  snapshot: ReconcileSubmission,
): void {
  if (_isCurrentReconcile(context)) {
    context.setState((previous) => {
      return {
        ...previous,
        error: undefined,
        fieldErrors: {},
        raisedElsewhere:
          "raisedElsewhere" in response ? response.raisedElsewhere : [],
        result:
          "movedCount" in response
            ? `${response.movedCount} moved; ${response.acknowledgedCount} left as they are.`
            : "The occasion's dates were widened.",
      };
    });
  }
  context.reads.queryClient.setQueryData(
    context.reads.detailQueryOptions.queryKey,
    response,
  );
  void invalidateMilestoneReads({
    queryClient: context.reads.queryClient,
    milestoneId: snapshot.milestone.milestoneId,
    itemIds: snapshot.action === "move" ? snapshot.itemIds : [],
    hasMovedItems: snapshot.action === "move",
  }).catch(() => {});
}
async function _refuseReconcile(
  context: Readonly<Context>,
  failure: Error,
  snapshot: ReconcileSubmission,
): Promise<void> {
  const isUncertain =
    context.guard.hasWritten &&
    (!(failure instanceof ApiRequestError) || failure.status >= 500);
  const fieldErrors =
    failure instanceof ApiRequestError
      ? getMilestoneFieldErrorsFromMoves({
          itemIds: snapshot.itemIds,
          fieldErrors: failure.details?.fieldErrors ?? {},
        })
      : {};
  if (_isCurrentReconcile(context)) {
    context.setState((previous) => {
      return {
        ...previous,
        fieldErrors,
        failedTargets:
          "mode" in snapshot.body && snapshot.body.mode === "move"
            ? Object.fromEntries(
                snapshot.body.moves.map(({ itemId, targetOn }) => {
                  return [itemId, targetOn];
                }),
              )
            : {},
        error: isUncertain
          ? "The change could not be confirmed. Reading current dates and attachments before another deliberate action."
          : context.guard.hasWritten
            ? "The change was refused. Review the occasion and any marked dates before choosing again."
            : failure.message,
      };
    });
  }
  if (context.guard.hasWritten) {
    await context.reads.refresh().catch(() => {});
  }
}
function _getReconcileMutationOptions(
  context: Readonly<Context>,
): UseMutationOptions<
  MilestoneDetail | ReconcileMilestoneResponse,
  Error,
  ReconcileSubmission
> {
  return {
    retry: false,
    mutationFn: (snapshot) => {
      return _writeReconcileFromSubmission(context, snapshot);
    },
    onSuccess: (response, snapshot) => {
      return _confirmReconcile(context, response, snapshot);
    },
    onError: (failure, snapshot) => {
      return _refuseReconcile(context, failure, snapshot);
    },
    onSettled: () => {
      context.guard.isLocked = false;
    },
  };
}
function _submitReconcileSnapshot({
  context,
  snapshot,
  mutate,
}: Readonly<{
  context: Context;
  snapshot: ReconcileSubmission;
  mutate: (snapshot: ReconcileSubmission) => void;
}>): void {
  if (
    context.guard.isLocked ||
    !_isCurrentReconcile(context) ||
    context.options.hasUsableAuthority === false ||
    !context.options.detail.canEdit ||
    !context.reads.hasUsableReads
  ) {
    return;
  }
  context.guard.isLocked = true;
  context.setState((previous) => {
    return {
      ...previous,
      error: undefined,
      result: undefined,
    };
  });
  mutate(snapshot);
}
/** Owns immediate duplicate guards, fresh authority and unconfirmed recovery. */
export function useMilestoneReconcileActions(
  options: Readonly<ReconcileOptions>,
  reads: Reads,
): ReconcileActions {
  const { current, guard } = useMilestoneReconcileLifetime(options);
  const [state, setState] = useState<ReconcileState>({
    error: undefined,
    fieldErrors: {},
    failedTargets: {},
    raisedElsewhere: [],
    result: undefined,
  });
  const context = { options, current, guard: guard.current, reads, setState };
  const mutation = useMutation(_getReconcileMutationOptions(context));
  const submit = (snapshot: ReconcileSubmission) => {
    _submitReconcileSnapshot({ context, snapshot, mutate: mutation.mutate });
  };
  return {
    ...state,
    submit,
    isPending: mutation.isPending,
    clearFieldError: (itemId: string) => {
      setState((previous) => {
        return {
          ...previous,
          fieldErrors: Object.fromEntries(
            Object.entries(previous.fieldErrors).filter(([id]) => {
              return id !== itemId;
            }),
          ),
        };
      });
    },
  };
}
