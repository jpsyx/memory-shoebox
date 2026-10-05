import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  createMilestone,
  updateMilestone,
} from "@/api/milestoneHelpers/milestoneHelpers";
import type { CreateMilestoneBody } from "@/api/milestoneHelpers/milestoneHelpers.types";
import { makeMilestoneDetailQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import type { MilestoneDetail } from "@memory-shoebox/shared";
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
import type { MilestoneSelection } from "./milestoneFormHelpers";
import type { MilestoneFormOptions } from "./useMilestoneForm";
type SubmissionHookState = {
  state: SubmissionState;
  isLocked: RefObject<boolean>;
  error: string | undefined;
  fieldErrors: Record<string, string[]>;
  isUncertain: boolean;
  setError: Dispatch<SetStateAction<string | undefined>>;
  setFieldErrors: Dispatch<SetStateAction<Record<string, string[]>>>;
};
type SubmissionState = {
  isMounted: { current: boolean };
  hasWritten: { current: boolean };
  current: { current: MilestoneFormOptions };
  setError: (error: string | undefined) => void;
  setFieldErrors: (errors: Record<string, string[]>) => void;
  setIsUncertain: (uncertain: boolean) => void;
  queryClient: QueryClient;
  options: MilestoneFormOptions;
};
async function _confirmMilestoneSave(
  options: Readonly<{ state: SubmissionState; detail: MilestoneDetail }>,
): Promise<void> {
  const { state, detail } = options;
  if (state.isMounted.current) {
    state.options.onSaved(detail);
  }
  await invalidateMilestoneReads({
    queryClient: state.queryClient,
    milestoneId: detail.milestone.milestoneId,
    itemIds: state.options.selection?.map((item) => {
      return item.itemId;
    }),
  }).catch(() => {});
}
function _refuseMilestoneSave(
  options: Readonly<{ state: SubmissionState; failure: Error }>,
): void {
  const { state, failure } = options;
  if (!state.isMounted.current) {
    return;
  }
  const uncertain =
    state.hasWritten.current &&
    (!(failure instanceof ApiRequestError) || failure.status >= 500);
  if (uncertain) {
    void state.queryClient.invalidateQueries({
      queryKey: ["milestones"],
      refetchType: "active",
    });
  }
  state.setFieldErrors(
    failure instanceof ApiRequestError
      ? (failure.details?.fieldErrors ?? {})
      : {},
  );
  state.setIsUncertain(uncertain);
  state.setError(
    uncertain
      ? "The occasion may have been saved, but its answer did not arrive. Return to the list and review it before explicitly creating or editing again. Names can repeat."
      : failure instanceof ApiRequestError && failure.code === "occasion_busy"
        ? failure.message
        : "The occasion was not saved. Your words are kept. Check the fields and try again.",
  );
}
function _hasCurrentFormAuthority(
  state: Readonly<
    Omit<SubmissionState, "options"> & {
      options: Readonly<
        Omit<MilestoneFormOptions, "selection"> & {
          selection?: Readonly<MilestoneSelection>;
        }
      >;
    }
  >,
): boolean {
  const { options, current, queryClient } = state;
  if (
    !state.isMounted.current ||
    current.current.memberId !== options.memberId ||
    current.current.detail?.milestone.milestoneId !==
      options.detail?.milestone.milestoneId ||
    current.current.detail?.canEdit === false
  ) {
    return false;
  }
  if (!options.detail || !options.memberId) {
    return current.current.hasUsableAuthority !== false;
  }
  const authority = queryClient.getQueryState<MilestoneDetail>(
    makeMilestoneDetailQueryOptionsFromIdentity({
      memberId: options.memberId,
      milestoneId: options.detail.milestone.milestoneId,
    }).queryKey,
  );
  return (
    authority?.status === "success" &&
    authority.fetchStatus === "idle" &&
    authority.data?.canEdit === true
  );
}
async function _saveMilestoneFields({
  state,
  body,
}: Readonly<{
  state: SubmissionState;
  body: CreateMilestoneBody;
}>): Promise<MilestoneDetail> {
  const { options } = state;
  if (options.detail && options.memberId) {
    await state.queryClient.fetchQuery({
      ...makeMilestoneDetailQueryOptionsFromIdentity({
        memberId: options.memberId,
        milestoneId: options.detail.milestone.milestoneId,
      }),
      staleTime: 0,
      retry: false,
    });
  }
  if (!_hasCurrentFormAuthority(state)) {
    throw new ApiRequestError({
      status: 409,
      code: "occasion_changed",
      message: "Review the occasion before saving.",
    });
  }
  state.hasWritten.current = true;
  return options.detail
    ? updateMilestone({
        milestoneId: options.detail.milestone.milestoneId,
        body: {
          name: body.name,
          blurb: body.blurb,
          startsOn: body.startsOn,
          endsOn: body.endsOn,
        },
      })
    : createMilestone(body);
}
type Submission = {
  submit: (body: CreateMilestoneBody) => void;
  fieldErrors: Record<string, string[]>;
  setFieldErrors: (errors: Record<string, string[]>) => void;
  error: string | undefined;
  setError: (error: string | undefined) => void;
  isUncertain: boolean;
  isSaving: boolean;
  hasSaved: boolean;
};
function _getMilestoneMutationOptions({
  state,
  isLocked,
}: Readonly<{
  state: SubmissionState;
  isLocked: { current: boolean };
}>): UseMutationOptions<MilestoneDetail, Error, CreateMilestoneBody> {
  return {
    retry: false,
    mutationFn: (body: CreateMilestoneBody) => {
      return state.options.detail
        ? runMilestoneWrite({
            queryClient: state.queryClient,
            milestoneId: state.options.detail.milestone.milestoneId,
            write: () => {
              return _saveMilestoneFields({ state, body });
            },
          })
        : _saveMilestoneFields({ state, body });
    },
    onSuccess: (detail) => {
      return _confirmMilestoneSave({ state, detail });
    },
    onError: (failure) => {
      return _refuseMilestoneSave({ state, failure });
    },
    onSettled: () => {
      isLocked.current = false;
    },
  };
}
function useMilestoneSubmissionState(
  options: Parameters<typeof useMilestoneSubmission>[0],
): SubmissionHookState {
  const queryClient = useQueryClient();
  const savedOptions: MilestoneFormOptions = {
    ...options,
    selection: options.selection?.slice(),
  };
  const current = useRef(savedOptions);
  current.current = savedOptions;
  const isLocked = useRef(false);
  const isMounted = useRef(true);
  const hasWritten = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string>();
  const [isUncertain, setIsUncertain] = useState(false);
  useEffect(function trackMilestoneFormLifetime() {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const state = {
    current,
    isMounted,
    hasWritten,
    setFieldErrors,
    setError,
    setIsUncertain,
    queryClient,
    options: savedOptions,
  };
  return {
    state,
    isLocked,
    error,
    fieldErrors,
    isUncertain,
    setError,
    setFieldErrors,
  };
}
/** Owns a guarded, non-retrying create or update mutation. */
export function useMilestoneSubmission(
  options: Readonly<
    Omit<MilestoneFormOptions, "selection"> & {
      selection?: Readonly<MilestoneSelection>;
    }
  >,
): Submission {
  const {
    state,
    isLocked,
    error,
    fieldErrors,
    isUncertain,
    setError,
    setFieldErrors,
  } = useMilestoneSubmissionState(options);
  const mutation = useMutation(
    _getMilestoneMutationOptions({ state, isLocked }),
  );
  const submit = (body: CreateMilestoneBody) => {
    if (isLocked.current || isUncertain || mutation.isSuccess) {
      return;
    }
    isLocked.current = true;
    state.hasWritten.current = false;
    setError(undefined);
    setFieldErrors({});
    mutation.mutate(body);
  };
  return {
    submit,
    fieldErrors,
    setFieldErrors,
    error,
    setError,
    isUncertain,
    isSaving: mutation.isPending,
    hasSaved: mutation.isSuccess,
  };
}
