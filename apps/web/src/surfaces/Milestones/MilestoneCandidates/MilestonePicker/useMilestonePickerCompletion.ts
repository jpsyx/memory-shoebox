import { useEffect, useRef } from "react";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { MilestoneAttachment } from "../../useMilestoneAttachment/useMilestoneAttachment.types";
/** Completes no-change saves once, without invented server delta counts. */
export function useMilestonePickerCompletion(
  options: Readonly<{
    picker: MilestoneAttachment;
    onDone: () => void;
    onFix: (detail: MilestoneDetail) => void;
  }>,
): void {
  const { picker, onDone, onFix } = options;
  const hasFinished = useRef(false);
  useEffect(
    function finishConfirmedAttachmentSave() {
      if (
        picker.savedDetail === undefined ||
        picker.savedCounts !== undefined ||
        hasFinished.current
      ) {
        return;
      }
      hasFinished.current = true;
      if (picker.savedDetail.mismatchCount > 0) {
        onFix(picker.savedDetail);
      } else {
        onDone();
      }
    },
    [picker.savedDetail, picker.savedCounts, onDone, onFix],
  );
}
