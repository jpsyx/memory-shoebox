import type { UploadFileState } from "@memory-shoebox/shared";
import type {
  GetUploadSessionOptions,
  getUploadSession,
} from "../uploadsHelpers";

/** Complete read with an injectable route helper and immutable state filter. */
export type GetWholeUploadSessionOptions = Omit<
  GetUploadSessionOptions,
  "states"
> & {
  states?: readonly UploadFileState[];
  read?: typeof getUploadSession;
};
