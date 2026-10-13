import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadDateReview } from "@/upload/getUploadDateReviewFromDetail/getUploadDateReviewFromDetail";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadDateReviewField } from "./UploadDateReviewField";
import { UploadDateThumbnail } from "./UploadDateThumbnail";
import { useUploadDateReviewForm } from "./useUploadDateReviewForm";
import classes from "./UploadDateReviewRow.module.css";

type Props = {
  row: UploadDateReview;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
};

/** One thumbnail, one editable suggestion, and one explicit confirmation. */
export function UploadDateReviewRow({
  row,
  snapshot,
  controller,
  previews,
}: Readonly<Props>): ReactNode {
  const form = useUploadDateReviewForm({
    row,
    controller,
    isDisabled: snapshot.isBusy,
  });
  return (
    <form
      ref={form.formRef}
      className={classes.reviewRow}
      aria-label={`Date for photo ${row.file.position + 1}`}
      onSubmit={(event) => {
        event.preventDefault();
        void form.onSubmit();
      }}
    >
      <UploadDateThumbnail
        file={row.file}
        localFile={snapshot.filesById.get(row.file.fileId)}
        previews={previews}
      />
      <UploadDateReviewField
        form={form}
        basis={row.basis}
        isDisabled={snapshot.isBusy}
      />
      <Button
        type="submit"
        disabled={!form.isValid || form.isPending || snapshot.isBusy}
        loading={form.isPending}
      >
        Confirm date
      </Button>
    </form>
  );
}
