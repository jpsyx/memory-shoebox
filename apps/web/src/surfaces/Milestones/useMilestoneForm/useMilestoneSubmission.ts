import {
  type UseMutationOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  createMilestone,
  updateMilestone,
} from "@/api/milestoneHelpers/milestoneHelpers";
import type { CreateMilestoneBody } from "@/api/milestoneHelpers/milestoneHelpers.types";
import { invalidateMilestoneReads } from "../invalidateMilestoneReads/invalidateMilestoneReads";
import type { MilestoneFormOptions } from "./useMilestoneForm";
type SubmissionState = {
  isMounted: { current: boolean };
  setError: (error: string | undefined) => void;
  setIsUncertain: (uncertain: boolean) => void;
  queryClient: QueryClient;
  options: Readonly<MilestoneFormOptions>;
};
async function _confirmMilestoneSave(
  options: Readonly<{ state: SubmissionState; detail: MilestoneDetail }>,
): Promise<void> {
  const { state, detail } = options;
  await invalidateMilestoneReads({
    queryClient: state.queryClient,
    milestoneId: detail.milestone.milestoneId,
    itemIds: state.options.selection?.map((item) => {
      return item.itemId;
    }),
  }).catch(() => {});
  if (state.isMounted.current) {
    state.options.onSaved(detail);
  }
}
function _refuseMilestoneSave(
  options: Readonly<{ state: SubmissionState; failure: Error }>,
): void {
  const { state, failure } = options;
  if (!state.isMounted.current) {
    return;
  }
  const uncertain =
    !(failure instanceof ApiRequestError) || failure.status >= 500;
  if (uncertain) {
    void state.queryClient.invalidateQueries({
      queryKey: ["milestones"],
      refetchType: "active",
    });
  }
  state.setIsUncertain(uncertain);
  state.setError(
    uncertain
      ? "The occasion may have been saved, but its answer did not arrive. Return to the list and review it before explicitly creating or editing again. Names can repeat."
      : "The occasion was not saved. Your words are kept. Check the fields and try again.",
  );
}
function _saveMilestoneFields({
  options,
  body,
}: Readonly<{
  options: MilestoneFormOptions;
  body: CreateMilestoneBody;
}>): Promise<MilestoneDetail> {
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
      return _saveMilestoneFields({ options: state.options, body });
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
/** Owns a guarded, non-retrying create or update mutation. */
export function useMilestoneSubmission(
  options: Readonly<MilestoneFormOptions>,
): Submission {
  const queryClient = useQueryClient();
  const isLocked = useRef(false);
  const isMounted = useRef(true);
  const [error, setError] = useState<string>();
  const [isUncertain, setIsUncertain] = useState(false);
  useEffect(function trackMilestoneFormLifetime() {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const state = { isMounted, setError, setIsUncertain, queryClient, options };
  const mutation = useMutation(
    _getMilestoneMutationOptions({ state, isLocked }),
  );
  const submit = (body: CreateMilestoneBody) => {
    if (isLocked.current || isUncertain || mutation.isSuccess) {
      return;
    }
    isLocked.current = true;
    setError(undefined);
    mutation.mutate(body);
  };
  return {
    submit,
    error,
    setError,
    isUncertain,
    isSaving: mutation.isPending,
    hasSaved: mutation.isSuccess,
  };
}
