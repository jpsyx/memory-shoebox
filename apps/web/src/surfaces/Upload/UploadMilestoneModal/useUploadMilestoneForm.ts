import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { createMilestone } from "@/api/milestoneHelpers/milestoneHelpers";
import { createMilestoneBodySchema } from "@/api/milestoneHelpers/milestoneSchemas.constants";
import { invalidateUploadMilestoneQueries } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import type { MilestoneSpan } from "@/system/MilestoneDateFields/MilestoneDateFields";
import type {
  UploadEditAttempt,
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { MilestoneRef } from "@memory-shoebox/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

type State = {
  isCreating: boolean;
  name: string;
  blurb: string;
  span: MilestoneSpan;
  chosenId?: string;
  created?: MilestoneRef;
  attempt?: UploadEditAttempt;
  error?: string;
  isUncertain: boolean;
  isReviewed: boolean;
  isSaving: boolean;
};
type Form = State & {
  patch: (change: Readonly<Partial<State>>) => void;
  coveredDates: string[];
  canCreate: boolean;
  onCreate: () => Promise<void>;
  onAttach: () => Promise<void>;
  onReload: () => Promise<void>;
};
type Options = {
  opened: boolean;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onClose: () => void;
  reloadList: () => Promise<boolean>;
};
type ActionOptions = {
  isCurrent: () => boolean;
  state: State;
  patch: (change: Readonly<Partial<State>>) => void;
  controller: UploadSessionController;
  onClose: () => void;
  client: ReturnType<typeof useQueryClient>;
  targetFileIds: readonly string[];
  sessionId: string;
};
function _getSelectedDatesFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): string[] {
  return (snapshot.detail?.files ?? []).flatMap((file) => {
    return snapshot.selectedFileIds.has(file.fileId) && file.capturedOn
      ? [file.capturedOn]
      : [];
  });
}
function _getInitialFormFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): State {
  const dates = _getSelectedDatesFromSnapshot(snapshot).sort();
  const startsOn = dates[0];
  const endsOn = dates[dates.length - 1];
  return {
    name: "",
    blurb: "",
    isCreating: false,
    span: {
      startsOn: startsOn ?? null,
      endsOn: endsOn ?? null,
      isMultiDay: startsOn !== endsOn,
    },
    isUncertain: false,
    isReviewed: false,
    isSaving: false,
  };
}
function _getCreateBodyFromState(
  state: Readonly<State>,
): ReturnType<typeof createMilestoneBodySchema.safeParse> {
  return createMilestoneBodySchema.safeParse({
    name: state.name,
    blurb: state.blurb.trim() || null,
    startsOn: state.span.startsOn,
    endsOn: state.span.isMultiDay ? state.span.endsOn : state.span.startsOn,
  });
}
async function _attachMilestone({
  options,
  milestoneId,
}: Readonly<{
  options: Readonly<ActionOptions>;
  milestoneId: string;
}>): Promise<void> {
  const { controller, patch, client, onClose } = options;
  if (!options.isCurrent()) {
    return;
  }
  patch({ isSaving: true, error: undefined });
  try {
    const retained = options.state.attempt;
    const attempt =
      retained?.sessionId === options.sessionId &&
      retained.labels[0]?.milestoneId === milestoneId
        ? retained
        : {
            sessionId: options.sessionId,
            targetFileIds: [...options.targetFileIds],
            labels: [{ kind: "milestone" as const, milestoneId }],
          };
    patch({ attempt });
    await controller.applyEditAttempt(attempt);
    if (!options.isCurrent()) {
      return;
    }
    await invalidateUploadMilestoneQueries(client);
    patch({
      created: undefined,
      attempt: undefined,
      isUncertain: false,
      isCreating: false,
      chosenId: undefined,
      name: "",
      blurb: "",
    });
    if (options.isCurrent()) {
      onClose();
    }
  } catch (error) {
    patch({
      error: `${options.state.created ? "The occasion is saved. " : ""}${error instanceof Error ? error.message : "Attachment is unavailable. Retry after reviewing the saved plan."}`,
    });
  } finally {
    patch({ isSaving: false });
  }
}
async function _createAndAttach(
  options: Readonly<ActionOptions>,
): Promise<void> {
  const body = _getCreateBodyFromState(options.state);
  if (
    !body.success ||
    options.state.isSaving ||
    options.state.isUncertain ||
    options.state.created
  ) {
    return;
  }
  options.patch({ isSaving: true, error: undefined });
  const created = await (async () => {
    try {
      const detail = await createMilestone(body.data);
      if (!options.isCurrent()) {
        return;
      }
      const createdMilestone = detail.milestone;
      options.patch({ created: createdMilestone });
      await invalidateUploadMilestoneQueries(options.client);
      return createdMilestone;
    } catch (error) {
      const isUncertain =
        !(error instanceof ApiRequestError) || error.status >= 500;
      options.patch({
        isSaving: false,
        isUncertain,
        isReviewed: false,
        error: isUncertain
          ? "The occasion may have been created, but its answer did not arrive. Reload the list and review it before choosing an occasion or explicitly creating another. Names can repeat; no attachment has been guessed."
          : "Creating milestones is unavailable. Your form is kept; retry when the service is available.",
      });
      return;
    }
  })();
  if (!created) {
    return;
  }
  await _attachMilestone({
    options: { ...options, state: { ...options.state, created } },
    milestoneId: created.milestoneId,
  });
}
function useMilestoneFormState({
  opened,
  snapshot,
}: Readonly<{
  opened: boolean;
  snapshot: Readonly<UploadSnapshot>;
}>): [State, Dispatch<SetStateAction<State>>] {
  const [state, setState] = useState(() => {
    return _getInitialFormFromSnapshot(snapshot);
  });
  const previousOpening = useRef({
    opened: false,
    sessionId: snapshot.detail?.sessionId,
  });
  const synchronizeMilestoneOpening = () => {
    const sessionId = snapshot.detail?.sessionId;
    const previous = previousOpening.current;
    if (sessionId !== previous.sessionId || (opened && !previous.opened)) {
      setState((current) => {
        return sessionId === previous.sessionId &&
          (current.created || current.isUncertain)
          ? current
          : _getInitialFormFromSnapshot(snapshot);
      });
    }
    previousOpening.current = { opened, sessionId };
  };
  useEffect(synchronizeMilestoneOpening, [opened, snapshot]);
  return [state, setState];
}

type FormSession = {
  state: State;
  patch: Form["patch"];
  client: ReturnType<typeof useQueryClient>;
  isCurrent: () => boolean;
};
function useMilestoneFormSession({
  opened,
  snapshot,
  controller,
}: Readonly<Pick<Options, "opened" | "snapshot" | "controller">>): FormSession {
  const [state, setState] = useMilestoneFormState({ opened, snapshot });
  const client = useQueryClient();
  const isCurrent = () => {
    return (
      controller.getSnapshot().detail?.sessionId === snapshot.detail?.sessionId
    );
  };
  const patch = (change: Readonly<Partial<State>>) => {
    if (isCurrent()) {
      setState((current) => {
        return { ...current, ...change };
      });
    }
  };
  return { state, patch, client, isCurrent };
}
function _getFormActionsFromOptions({
  options,
  reloadList,
}: Readonly<{
  options: Readonly<ActionOptions>;
  reloadList: Options["reloadList"];
}>): Pick<Form, "onCreate" | "onAttach" | "onReload"> {
  const { state, patch } = options;
  return {
    onCreate: () => {
      return _createAndAttach(options);
    },
    onAttach: () => {
      const milestoneId = state.created?.milestoneId ?? state.chosenId;
      return milestoneId && !state.isSaving
        ? _attachMilestone({ options, milestoneId })
        : Promise.resolve();
    },
    onReload: async () => {
      patch({ isSaving: true, isCreating: false, isReviewed: false });
      const isReviewed = await reloadList();
      patch({ isSaving: false, isReviewed });
    },
  };
}

/**
 * Keeps confirmed creation separate from attachment and uncertain responses.
 */
export function useUploadMilestoneForm({
  opened,
  snapshot,
  controller,
  onClose,
  reloadList,
}: Readonly<Options>): Form {
  const session = useMilestoneFormSession({ opened, snapshot, controller });
  const options = {
    ...session,
    controller,
    onClose,
    targetFileIds: [...snapshot.selectedFileIds],
    sessionId: snapshot.detail!.sessionId,
  };
  return {
    ...session.state,
    patch: session.patch,
    coveredDates: _getSelectedDatesFromSnapshot(snapshot),
    canCreate: _getCreateBodyFromState(session.state).success,
    ..._getFormActionsFromOptions({ options, reloadList }),
  };
}
