import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { getUploadDateReviewFromDetail } from "@/upload/getUploadDateReviewFromDetail/getUploadDateReviewFromDetail";
import type { ReactNode } from "react";
import { UploadUndatedSheet } from "./UploadUndatedSheet/UploadUndatedSheet";

type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
};

/** Keeps every uncertain date visible until its individual correction is saved. */
export function UploadUndated({
  snapshot,
  controller,
  previews,
}: Readonly<Props>): ReactNode {
  const rows = snapshot.detail
    ? getUploadDateReviewFromDetail(snapshot.detail)
    : [];
  return rows.length === 0 ? null : (
    <UploadUndatedSheet {...{ rows, snapshot, controller, previews }} />
  );
}
