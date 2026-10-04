import type { UploadProblemCode } from "@memory-shoebox/shared";
const PROBLEM_COPY: Record<
  UploadProblemCode | "upload_storage_unavailable",
  string
> = {
  unsupported_type:
    "This is not a supported photograph or video. It cannot go up here.",
  empty_file:
    "This file is empty. Choose an original with its contents still in it.",
  too_large: "This file is too large for the Shoebox. It cannot go up here.",
  connection_lost:
    "The connection was lost before this file was confirmed up. Try it again.",
  abandoned:
    "Sending stopped before this file arrived. Pick the original again to resume.",
  checksum_mismatch:
    "The received bytes did not match this file. Try the original again.",
  content_mismatch:
    "The file contents do not match the declared photograph or video. Check the original before trying again.",
  storage_rejected:
    "Storage rejected this file. Try it again when storage accepts uploads.",
  upload_storage_unavailable:
    "Storage is unavailable right now. What arrived stays saved; try again when it returns.",
  cancelled_by_uploader: "This file was left out when the batch was closed.",
};
/** Plain explanations keyed by stable refusal and upload failure codes. */
export function uploadProblemCopy(
  code: UploadProblemCode | "upload_storage_unavailable" | undefined | null,
): string {
  return code
    ? PROBLEM_COPY[code]
    : "This file is not confirmed up. Pick the original again to resume.";
}
