import { useState } from "react";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { useMilestoneAttachmentReads } from "./useMilestoneAttachmentReads";
import { useMilestoneAttachmentSave } from "./useMilestoneAttachmentSave";
import { useMilestoneAttachmentChoices } from "./useMilestoneAttachmentChoices";
import type {
  MilestoneAttachment,
  MilestoneAttachmentOptions,
} from "./useMilestoneAttachment.types";
export type { MilestoneAttachment } from "./useMilestoneAttachment.types";
function _createEmptySelection(): TimelineSelection {
  return { tags: [], people: [], from: undefined, until: undefined };
}
/** Owns first-observed attachment baselines and explicit retained choices. */
export function useMilestoneAttachment(
  options: Readonly<MilestoneAttachmentOptions>,
): MilestoneAttachment {
  const [selection, onSelectionChange] = useState(_createEmptySelection);
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
    try {
      submission.save(choices.getSnapshot());
    } catch (failure) {
      submission.setError(
        failure instanceof Error
          ? failure.message
          : "Your choices could not be saved.",
      );
    }
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
