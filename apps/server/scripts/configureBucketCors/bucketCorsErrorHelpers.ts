/** The statuses that mean the same, for an error that carries no name. */
const REFUSAL_STATUS_CODES = new Set([401, 403, 501]);

/** The HTTP status the AWS SDK attaches to an error, when it did. */
function _getStatusCodeFromError(error: object): number | undefined {
  const metadata = "$metadata" in error ? error.$metadata : undefined;
  return typeof metadata === "object" &&
    metadata !== null &&
    "httpStatusCode" in metadata &&
    typeof metadata.httpStatusCode === "number"
    ? metadata.httpStatusCode
    : undefined;
}

/**
 * Whether a CORS read or write failed because the application key, or
 * Backblaze's S3 compatibility layer, will not do it, as opposed to the
 * network or the bucket being wrong. Only that case has a console fallback
 * on the read; the write has one for any Backblaze error
 * (`isBackblazeError`).
 *
 * @param error Whatever the AWS SDK threw.
 */
export function isAccessOrUnsupportedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  const statusCode = _getStatusCodeFromError(error);
  return (
    new Set(["AccessDenied", "Unauthorized", "NotImplemented"]).has(name) ||
    (statusCode !== undefined && REFUSAL_STATUS_CODES.has(statusCode))
  );
}

/**
 * Whether an error is Backblaze (or the SDK on its behalf) answering, as
 * opposed to a bug in this script: it carries an HTTP status, or is one of the
 * refusal names. A network failure carries neither and is not one.
 *
 * Every such error from the write has the hand-entry instructions, whatever
 * its name, because the write may be refused for a reason that has nothing to
 * do with the key (a header Backblaze does not accept, say).
 *
 * @param error Whatever the AWS SDK threw.
 */
export function isBackblazeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (
    isAccessOrUnsupportedError(error) ||
    _getStatusCodeFromError(error) !== undefined
  );
}

/**
 * What Backblaze actually answered, raw: the error's name, its message and
 * its HTTP status. Printed beside the console fallback so a refusal is never
 * taken for a permissions problem on the strength of its classification
 * alone: Backblaze may refuse the request itself (a header it does not
 * accept, say) while the key is fine.
 *
 * @param error Whatever the AWS SDK threw.
 */
export function backblazeErrorSummary(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const name = "name" in error ? String(error.name) : "Unknown";
  const message = "message" in error ? String(error.message) : "(no message)";
  const statusCode = _getStatusCodeFromError(error);
  const status = statusCode === undefined ? "" : ` (HTTP ${statusCode})`;
  return `${name}: ${message}${status}`;
}
