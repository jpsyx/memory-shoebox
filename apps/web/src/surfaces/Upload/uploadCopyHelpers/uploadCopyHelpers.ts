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

const OPERATION_COPY: Record<string, string> = {
  load: "This batch could not be read. What is saved stays saved. Try reading it again.",
  declare:
    "The chosen files could not all be saved in this batch. Keep this tab open and continue saving them.",
  upload:
    "Uploading could not start. Check the chosen originals and visibility, then try again.",
  recover:
    "The chosen originals could not be matched. What is saved stays saved. Choose the files again.",
  retry:
    "These files could not be retried. What arrived stays saved. Read this batch again before retrying.",
  close:
    "This batch could not be finished. What arrived stays saved. Read it again before finishing.",
};
const REQUEST_COPY: Record<string, string> = {
  not_signed_in:
    "Sign in again to continue with this batch. What is saved stays saved.",
  forbidden:
    "This batch is not available to this account. Sign in with the account that chose it.",
  not_found:
    "This batch could not be found. Check its address or choose the files again.",
  upload_session_conflict:
    "Another batch is already open. Read that batch before choosing another one.",
  upload_manifest_conflict:
    "Some chosen files could not be added. Read the batch again to check which ones are saved.",
  upload_file_conflict:
    "This file has changed since it was read. Read the batch again before retrying.",
  upload_storage_unavailable: PROBLEM_COPY.upload_storage_unavailable,
};
/** Safe operation and request copy never exposes exception or validation diagnostics. */
export function uploadOperationProblemCopy(
  error: Readonly<{ operation: string; code?: string }>,
): string {
  return (
    (error.code ? REQUEST_COPY[error.code] : undefined) ??
    OPERATION_COPY[error.operation] ??
    "This change could not be saved. What was already saved stays saved. Read the batch again before trying again."
  );
}
