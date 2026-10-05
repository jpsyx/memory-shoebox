import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { useState } from "react";
import type {
  MilestoneAttachment,
  MilestoneAttachmentOptions,
} from "./useMilestoneAttachment.types";
import { useMilestoneAttachmentChoices } from "./useMilestoneAttachmentChoices";
import { useMilestoneAttachmentReads } from "./useMilestoneAttachmentReads";
import { useMilestoneAttachmentSave } from "./useMilestoneAttachmentSave";
export type { MilestoneAttachment } from "./useMilestoneAttachment.types";

function _saveAttachmentSnapshot({
  choices,
  submission,
}: Readonly<{
  choices: ReturnType<typeof useMilestoneAttachmentChoices>;
  submission: ReturnType<typeof useMilestoneAttachmentSave>;
}>): void {
  try {
    submission.save(choices.getSnapshot());
  } catch (failure) {
    submission.setError(
      failure instanceof Error
        ? failure.message
        : "Your choices could not be saved.",
    );
  }
}
/** Owns first-observed attachment baselines and explicit retained choices. */
export function useMilestoneAttachment(
  options: Readonly<MilestoneAttachmentOptions>,
): MilestoneAttachment {
  const [selection, onSelectionChange] = useState<TimelineSelection>(() => {
    return {
      tags: [],
      people: [],
      from: undefined,
      until: undefined,
    };
  });
  const reads = useMilestoneAttachmentReads({
    memberId: options.viewer.memberId,
    milestoneId: options.detail.milestone.milestoneId,
    source: options.source,
    selection,
  });
  const submission = useMilestoneAttachmentSave(options);
  const choices = useMilestoneAttachmentChoices({
    entries: reads.entries,
    isLocked: submission.isPending || submission.savedDetail !== undefined,
  });
  const save = () => {
    _saveAttachmentSnapshot({ choices, submission });
  };
  return {
    ...choices,
    save,
    isPending: submission.isPending,
    error: submission.error ?? reads.error,
    selection,
    onSelectionChange,
    isReading: reads.isReading,
    retryReads: reads.retryReads,
    hasMore: reads.hasMore,
    loadMore: reads.loadMore,
    savedDetail: submission.savedDetail,
    savedCounts: submission.savedCounts,
  };
}
