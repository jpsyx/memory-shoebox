import { useState, type Dispatch, type SetStateAction } from "react";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import {
  getInitialMilestoneFieldsFromOptions,
  getMilestoneBodyFromFields,
  type MilestoneSelection,
} from "./milestoneFormHelpers";
import type { MilestoneSpan } from "@/system/MilestoneDateFields/MilestoneDateFields";
import { useMilestoneSubmission } from "./useMilestoneSubmission";
/** Inputs and confirmed completion callbacks for an occasion form. */
export type MilestoneFormOptions = {
  detail?: MilestoneDetail;
  selection?: MilestoneSelection;
  onSaved: (detail: MilestoneDetail) => void;
  onCancel: () => void;
};
type Form = Pick<
  ReturnType<typeof useMilestoneSubmission>,
  "error" | "isUncertain" | "isSaving" | "hasSaved"
> & {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  blurb: string;
  setBlurb: Dispatch<SetStateAction<string>>;
  span: MilestoneSpan;
  setSpan: Dispatch<SetStateAction<MilestoneSpan>>;
  onSubmit: () => void;
};
/** Owns retained form words, one-time prefill and guarded explicit writes. */
export function useMilestoneForm(
  options: Readonly<MilestoneFormOptions>,
): Form {
  const [initial] = useState(() => {
    return getInitialMilestoneFieldsFromOptions(options);
  });
  const [name, setName] = useState(initial.name);
  const [blurb, setBlurb] = useState(initial.blurb);
  const [span, setSpan] = useState(initial.span);
  const submission = useMilestoneSubmission(options);
  const onSubmit = () => {
    const body = getMilestoneBodyFromFields({
      name,
      blurb,
      span,
      selection: options.selection,
    });
    if (!body.success) {
      submission.setError(
        "Give the occasion a name (up to 200 characters), a day or ordered span, and at most 280 characters about it.",
      );
      return;
    }
    if (options.detail && !options.detail.canEdit) {
      submission.setError("This occasion is read-only.");
      return;
    }
    submission.submit(body.data);
  };
  return {
    name,
    setName,
    blurb,
    setBlurb,
    span,
    setSpan,
    onSubmit,
    error: submission.error,
    isSaving: submission.isSaving,
    isUncertain: submission.isUncertain,
    hasSaved: submission.hasSaved,
  };
}
