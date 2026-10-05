import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
/** A refused privileged read requires account reconciliation, not stale rows. */
export function isObservationAuthorityError(error: Error | null): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 401 || error.status === 403)
  );
}
