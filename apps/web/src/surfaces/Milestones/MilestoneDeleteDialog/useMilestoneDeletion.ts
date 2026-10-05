import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { deleteMilestone } from "@/api/milestoneHelpers/milestoneHelpers";
import { makeMilestoneDetailQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import type {
  DeleteMilestoneResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { invalidateMilestoneReads } from "../invalidateMilestoneReads/invalidateMilestoneReads";
import { runMilestoneWrite } from "../runMilestoneWrite";
type DeleteState = {
  isLocked: RefObject<boolean>;
  isMounted: RefObject<boolean>;
  hasWritten: RefObject<boolean>;
  error: string | undefined;
  setError: Dispatch<SetStateAction<string | undefined>>;
  isUncertain: boolean;
  setIsUncertain: Dispatch<SetStateAction<boolean>>;
  isRefreshing: boolean;
  setIsRefreshing: Dispatch<SetStateAction<boolean>>;
  canDelete: boolean;
  setCanDelete: Dispatch<SetStateAction<boolean>>;
};
type ConfirmMilestoneDeletionOptions = {
  state: DeleteState;
  result: DeleteMilestoneResponse;
  queryClient: QueryClient;
  onDeleted: Options["onDeleted"];
};
type SubmitMilestoneDeletionOptions = {
  state: DeleteState;
  options: Options;
  hasSaved: boolean;
  mutate: () => void;
};

type Options = {
  detail: MilestoneDetail;
  memberId: string;
  onDeleted: (result: DeleteMilestoneResponse) => void;
};
function useMilestoneDeleteState(
  detail: Readonly<MilestoneDetail>,
): DeleteState {
  const isLocked = useRef(false);
  const isMounted = useRef(true);
  const hasWritten = useRef(false);
  const [error, setError] = useState<string>();
  const [isUncertain, setIsUncertain] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canDelete, setCanDelete] = useState(detail.canDelete);
  useEffect(function trackDeletionLifetime() {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return {
    isLocked,
    isMounted,
    hasWritten,
    error,
    setError,
    isUncertain,
    setIsUncertain,
    isRefreshing,
    setIsRefreshing,
    canDelete,
    setCanDelete,
  };
}

function _refuseMilestoneDeletion({
  state,
  failure,
}: Readonly<{ state: DeleteState; failure: Error }>): void {
  if (!state.isMounted.current) {
    return;
  }
  const uncertain =
    state.hasWritten.current &&
    (!(failure instanceof ApiRequestError) || failure.status >= 500);
  state.setIsUncertain(uncertain);
  state.setCanDelete(false);
  state.setError(
    uncertain
      ? "The deletion answer did not arrive. Refresh the occasion before trying again, or return to the list to review it."
      : failure instanceof ApiRequestError && failure.code === "occasion_busy"
        ? failure.message
        : "The milestone was not deleted. Refresh it to check permission before trying again.",
  );
}
async function _confirmMilestoneDeletion(
  options: Readonly<ConfirmMilestoneDeletionOptions>,
): Promise<void> {
  if (options.state.isMounted.current) {
    options.onDeleted(options.result);
  }
  await invalidateMilestoneReads({
    queryClient: options.queryClient,
    milestoneId: options.result.milestoneId,
  }).catch(() => {});
}
async function _refreshMilestoneDeletion({
  state,
  queryClient,
  options,
}: Readonly<{
  state: DeleteState;
  queryClient: QueryClient;
  options: Options;
}>): Promise<void> {
  if (state.isLocked.current) {
    return;
  }
  state.isLocked.current = true;
  state.setIsRefreshing(true);
  try {
    const refreshed = await queryClient.fetchQuery({
      ...makeMilestoneDetailQueryOptionsFromIdentity({
        memberId: options.memberId,
        milestoneId: options.detail.milestone.milestoneId,
      }),
      staleTime: 0,
      retry: false,
    });
    if (state.isMounted.current) {
      state.setCanDelete(refreshed.canDelete);
      state.setIsUncertain(false);
      state.setError(
        refreshed.canDelete ? undefined : "This milestone is read-only.",
      );
    }
  } catch {
    if (state.isMounted.current) {
      state.setError(
        "The occasion could not be refreshed. Review the list; the deletion is still unconfirmed.",
      );
    }
  } finally {
    state.isLocked.current = false;
    if (state.isMounted.current) {
      state.setIsRefreshing(false);
    }
  }
}
function _submitMilestoneDeletion({
  state,
  options,
  hasSaved,
  mutate,
}: Readonly<SubmitMilestoneDeletionOptions>): void {
  if (
    state.isLocked.current ||
    state.isUncertain ||
    !state.canDelete ||
    !options.detail.canDelete ||
    hasSaved
  ) {
    return;
  }
  state.isLocked.current = true;
  state.hasWritten.current = false;
  state.setError(undefined);
  mutate();
}
type Deletion = {
  onDelete: () => void;
  onRefresh: () => Promise<void>;
  error: string | undefined;
  isUncertain: boolean;
  isPending: boolean;
  isBlocked: boolean;
};
type DeleteContext = {
  state: DeleteState;
  queryClient: QueryClient;
  options: Options;
  current: { current: Options };
};
async function _deleteWithCurrentAuthority({
  state,
  queryClient,
  options,
  current,
}: Readonly<DeleteContext>): Promise<DeleteMilestoneResponse> {
  const detail = await queryClient.fetchQuery({
    ...makeMilestoneDetailQueryOptionsFromIdentity({
      memberId: options.memberId,
      milestoneId: options.detail.milestone.milestoneId,
    }),
    staleTime: 0,
    retry: false,
  });
  if (
    !state.isMounted.current ||
    current.current.memberId !== options.memberId ||
    current.current.detail.milestone.milestoneId !==
      detail.milestone.milestoneId ||
    !detail.canDelete ||
    !current.current.detail.canDelete
  ) {
    throw new ApiRequestError({
      status: 409,
      code: "occasion_changed",
      message: "Review the occasion before deleting it.",
    });
  }
  state.hasWritten.current = true;
  return deleteMilestone(detail.milestone.milestoneId);
}
function _getMilestoneDeleteMutationOptions({
  state,
  queryClient,
  options,
  current,
}: Readonly<DeleteContext>): UseMutationOptions<
  DeleteMilestoneResponse,
  Error,
  void
> {
  return {
    retry: false,
    mutationFn: () => {
      return runMilestoneWrite({
        queryClient,
        milestoneId: options.detail.milestone.milestoneId,
        write: () => {
          return _deleteWithCurrentAuthority({
            state,
            queryClient,
            options,
            current,
          });
        },
      });
    },
    onSuccess: (result) => {
      return _confirmMilestoneDeletion({
        state,
        result,
        queryClient,
        onDeleted: options.onDeleted,
      });
    },
    onError: (failure) => {
      return _refuseMilestoneDeletion({ state, failure });
    },
    onSettled: () => {
      state.isLocked.current = false;
    },
  };
}
/**
 * Guards deletion and requires an authoritative read before uncertain retry.
 */
export function useMilestoneDeletion(options: Readonly<Options>): Deletion {
  const queryClient = useQueryClient();
  const current = useRef(options);
  current.current = options;
  const state = useMilestoneDeleteState(options.detail);
  const mutation = useMutation(
    _getMilestoneDeleteMutationOptions({
      state,
      queryClient,
      options,
      current,
    }),
  );
  const onDelete = () => {
    return _submitMilestoneDeletion({
      state,
      options,
      hasSaved: mutation.isSuccess,
      mutate: mutation.mutate,
    });
  };
  const onRefresh = () => {
    return _refreshMilestoneDeletion({ state, queryClient, options });
  };
  return {
    onDelete,
    onRefresh,
    error: state.error,
    isUncertain: state.isUncertain,
    isPending: mutation.isPending || state.isRefreshing,
    isBlocked:
      mutation.isPending ||
      state.isRefreshing ||
      state.isUncertain ||
      !state.canDelete ||
      !options.detail.canDelete ||
      mutation.isSuccess,
  };
}
