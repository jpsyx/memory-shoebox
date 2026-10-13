import { TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { UploadDateReview } from "@/upload/getUploadDateReviewFromDetail/getUploadDateReviewFromDetail";
import type { useUploadDateReviewForm } from "./useUploadDateReviewForm";
import classes from "./UploadDateReviewField.module.css";

/** Explains the suggestion's evidence without presenting it as a capture fact. */
const SUGGESTION_COPY: Record<UploadDateReview["basis"], string> = {
  surrounding: "Suggested from the photos on either side.",
  previous: "Suggested from the preceding dated photo.",
  following: "Suggested from the following dated photo.",
  file_mtime: "File modification date only. Check when this was taken.",
  upload_time: "Upload date only. Check when this was taken.",
  unknown: "No date to suggest. Choose the day this was taken.",
};

/** Keeps one date input, its suggestion basis, and save error together. */
export function UploadDateReviewField({
  form,
  basis,
  isDisabled,
}: Readonly<{
  form: ReturnType<typeof useUploadDateReviewForm>;
  basis: UploadDateReview["basis"];
  isDisabled: boolean;
}>): ReactNode {
  return (
    <div className={classes.dateField}>
      <TextInput
        type="date"
        label="Capture date"
        description={SUGGESTION_COPY[basis]}
        classNames={{ input: classes.uploadUndatedSheetPrintDateInput }}
        value={form.capturedOn}
        onChange={(event) => {
          return form.setChosenDay(event.currentTarget.value);
        }}
        disabled={form.isPending || isDisabled}
      />
      {form.error ? (
        <p role="alert" className={classes.saveError}>
          {form.error}
        </p>
      ) : null}
    </div>
  );
}
