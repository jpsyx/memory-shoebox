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
  memberId?: string;
  selection?: MilestoneSelection;
  /** Cached fields stay mounted while unusable authority blocks submission. */
  hasUsableAuthority?: boolean;
  onSaved: (detail: MilestoneDetail) => void;
  onCancel: () => void;
};
type Form = Pick<
  ReturnType<typeof useMilestoneSubmission>,
  "fieldErrors" | "error" | "isUncertain" | "isSaving" | "hasSaved"
> & {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  blurb: string;
  setBlurb: Dispatch<SetStateAction<string>>;
  span: MilestoneSpan;
  setSpan: Dispatch<SetStateAction<MilestoneSpan>>;
  onSubmit: () => void;
};
function _getMilestonePermissionErrorFromOptions(
  options: Readonly<MilestoneFormOptions>,
): string | undefined {
  if (options.hasUsableAuthority === false) {
    return "Refresh the occasion to check its current permission before saving. Your words are kept.";
  }
  return options.detail && !options.detail.canEdit
    ? "This occasion is read-only."
    : undefined;
}
type FormSubmission = {
  options: MilestoneFormOptions;
  submission: ReturnType<typeof useMilestoneSubmission>;
  fields: Parameters<typeof getMilestoneBodyFromFields>[0];
};
function _submitMilestoneForm({
  options,
  submission,
  fields,
}: Readonly<FormSubmission>): void {
  const permissionError = _getMilestonePermissionErrorFromOptions(options);
  if (permissionError) {
    submission.setError(permissionError);
    return;
  }
  const body = getMilestoneBodyFromFields(fields);
  if (!body.success) {
    submission.setFieldErrors(
      Object.fromEntries(
        body.error.issues.map((issue) => {
          const field = String(issue.path[0] ?? "");
          return [
            field,
            [
              field === "startsOn" || field === "endsOn"
                ? "Choose a valid first and last day, in order."
                : issue.message,
            ],
          ];
        }),
      ),
    );
    submission.setError(
      "Give the occasion a name (up to 200 characters), a day or ordered span, and at most 280 characters about it.",
    );
    return;
  }
  submission.submit(body.data);
}
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
    _submitMilestoneForm({
      options,
      submission,
      fields: { name, blurb, span, selection: options.selection },
    });
  };
  return {
    name,
    setName,
    blurb,
    setBlurb,
    span,
    setSpan,
    onSubmit,
    fieldErrors: submission.fieldErrors,
    error: submission.error,
    isSaving: submission.isSaving,
    isUncertain: submission.isUncertain,
    hasSaved: submission.hasSaved,
  };
}
