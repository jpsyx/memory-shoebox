import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/** A request's outcome, using the prototype's family language. */
export function removalStateLabel(state: RemovalRequestDto["state"]): string {
  return {
    open: "Waiting",
    deleted: "Deleted",
    declined: "Kept",
    withdrawn: "Withdrawn",
  }[state];
}

/** Stable recovery copy without exposing transport or server exceptions. */
export function removalWriteFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 400) {
    return "Please check your words and try again.";
  }
  if (
    error instanceof ApiRequestError &&
    [403, 404, 409].includes(error.status)
  ) {
    return "This request has changed. Review its current state before trying again.";
  }
  return "We could not confirm the answer. Review the refreshed request before you try again.";
}

/** A visible photograph address exists only when both wire values exist. */
export function getItemHrefFromRemovalRequest(
  request: Readonly<RemovalRequestDto>,
): string | undefined {
  return request.itemId === null || request.media === null
    ? undefined
    : `/items/${encodeURIComponent(request.itemId)}`;
}
