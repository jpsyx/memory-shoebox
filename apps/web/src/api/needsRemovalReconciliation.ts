import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
/** Refusals and uncertain writes need request authority before a retry. */
export function needsRemovalReconciliation(error: unknown): boolean {
  return (
    !(error instanceof ApiRequestError) ||
    error.status >= 500 ||
    [403, 404, 409].includes(error.status)
  );
}
