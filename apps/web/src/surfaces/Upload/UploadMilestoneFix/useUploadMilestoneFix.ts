import { updateMilestone } from "@/api/milestoneHelpers/milestoneHelpers";
import { invalidateUploadMilestoneQueries } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadMismatchGroup } from "@memory-shoebox/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type Dispatch, type SetStateAction } from "react";

type Options = {
  group: UploadMismatchGroup;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onDismiss: () => void;
};
type State = {
  approach: "photos" | "milestone";
  days: Record<string, string>;
  isSaving: boolean;
  hasWidened: boolean;
  error?: string;
};

type Form = State & {
  patch: (change: Readonly<Partial<State>>) => void;
  widenedSpan: { startsOn: string; endsOn: string };
  isSpan: boolean;
  canMove: boolean;
  onSubmit: () => Promise<void>;
  onDayChange: ({
    fileId,
    day,
  }: Readonly<{ fileId: string; day: string }>) => void;
};
type ActionOptions = {
  isCurrent: () => boolean;
  options: Options;
  state: State;
  patch: (change: Readonly<Partial<State>>) => void;
  client: ReturnType<typeof useQueryClient>;
  widenedSpan: { startsOn: string; endsOn: string };
};
function _getWidenedSpanFromGroup(group: Readonly<UploadMismatchGroup>): {
  startsOn: string;
  endsOn: string;
} {
  const dates = [
    group.milestone.startsOn,
    group.milestone.endsOn,
    ...group.files.map((file) => {
      return file.capturedOn;
    }),
  ].sort();
  return { startsOn: dates[0]!, endsOn: dates[dates.length - 1]! };
}
async function _saveMilestoneFix({
  options,
  state,
  patch,
  widenedSpan,
}: Readonly<ActionOptions>): Promise<boolean> {
  if (state.approach === "milestone") {
    if (!state.hasWidened) {
      await updateMilestone({
        milestoneId: options.group.milestone.milestoneId,
        body: widenedSpan,
      });
      patch({ hasWidened: true });
    }
  } else {
    await options.controller.amendDates(
      options.group.files.map((file) => {
        return {
          fileId: file.fileId,
          capturedOn:
            options.group.milestone.startsOn === options.group.milestone.endsOn
              ? options.group.milestone.startsOn
              : state.days[file.fileId]!,
        };
      }),
    );
  }
  return state.approach === "milestone";
}

async function _submitMilestoneFix({
  options,
  state,
  patch,
  client,
  widenedSpan,
  isCurrent,
}: Readonly<ActionOptions>): Promise<void> {
  if (state.isSaving || options.snapshot.isBusy || !isCurrent()) {
    return;
  }
  patch({ isSaving: true, error: undefined });
  let hasWidened = state.hasWidened;
  try {
    hasWidened = await _saveMilestoneFix({
      options,
      state,
      patch,
      client,
      widenedSpan,
      isCurrent,
    });
    if (!isCurrent()) {
      return;
    }
    if (hasWidened) {
      await options.controller.loadSession(options.snapshot.detail!.sessionId);
    }
    if (isCurrent()) {
      options.onDismiss();
    }
  } catch (error) {
    patch({
      error: hasWidened
        ? "The occasion was widened. Refreshing this upload failed; retry to read its saved plan."
        : state.approach === "milestone"
          ? "Widening the occasion is unavailable or unconfirmed. Retry to save the span; your file dates have not changed."
          : error instanceof Error
            ? error.message
            : "The dates could not be saved. Review the files and retry.",
    });
  } finally {
    await invalidateUploadMilestoneQueries(client);
    patch({ isSaving: false });
  }
}
function _setChosenDay(
  options: Readonly<{
    setState: Dispatch<SetStateAction<State>>;
    fileId: string;
    day: string;
  }>,
): void {
  options.setState((current) => {
    return {
      ...current,
      days: { ...current.days, [options.fileId]: options.day },
    };
  });
}
type FixSession = {
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  isCurrent: () => boolean;
  patch: (change: Readonly<Partial<State>>) => void;
};
function useUploadFixSession(options: Readonly<Options>): FixSession {
  const [state, setState] = useState<State>({
    approach: "photos",
    days: {},
    isSaving: false,
    hasWidened: false,
  });
  const isCurrent = () => {
    return (
      options.controller.getSnapshot().detail?.sessionId ===
      options.snapshot.detail?.sessionId
    );
  };
  const patch = (change: Readonly<Partial<State>>) => {
    if (isCurrent()) {
      setState((current) => {
        return { ...current, ...change };
      });
    }
  };
  return { state, setState, isCurrent, patch };
}
/** Uses manifest dates for moves and an occasion delta for widening. */
export function useUploadMilestoneFix(options: Readonly<Options>): Form {
  const { state, setState, isCurrent, patch } = useUploadFixSession(options);
  const client = useQueryClient();
  const widenedSpan = _getWidenedSpanFromGroup(options.group);
  const { milestone, files } = options.group;
  const isSpan = milestone.startsOn !== milestone.endsOn;
  const canMove = files.every((file) => {
    const day = isSpan ? state.days[file.fileId] : milestone.startsOn;
    return !!day && day >= milestone.startsOn && day <= milestone.endsOn;
  });
  return {
    ...state,
    patch,
    widenedSpan,
    isSpan,
    canMove,
    onSubmit: () => {
      return _submitMilestoneFix({
        options,
        state,
        patch,
        client,
        widenedSpan,
        isCurrent,
      });
    },
    onDayChange: ({
      fileId,
      day,
    }: Readonly<{ fileId: string; day: string }>) => {
      _setChosenDay({ setState, fileId, day });
    },
  };
}
