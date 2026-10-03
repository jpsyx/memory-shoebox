import { ApiError } from "../http/ApiError.ts";

/**
 * Runs one Backblaze operation, turning any failure into `503
 * upload_storage_unavailable` (`upload.md` Ruling 9).
 *
 * The status is the sentence "a third party is down while the database is
 * fine", which is different from any 4xx and from a 500. The original error
 * rides along as `cause`, so the error handler's log line for a 5xx still
 * says what Backblaze answered. A synchronous throw from the operation is
 * caught the same way as a rejection.
 *
 * @param operation The call to make.
 * @returns What Backblaze answered.
 */
export async function callBackblaze<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    throw Object.assign(ApiError.unavailable("upload_storage_unavailable"), {
      cause: error,
    });
  }
}
