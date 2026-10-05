import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
/**
 * A refused privileged read requires account reconciliation, not stale rows.
 */
export function isObservationAuthorityError(error: Error | undefined): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 401 || error.status === 403)
  );
}
