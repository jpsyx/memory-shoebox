import { profileNameFailure } from "@/surfaces/ProfileCompletion/profileNameCopy";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/**
 * Whole minutes, rounded up and never below one.
 *
 * The same rule as `signInCopy`'s `_minutes`, kept local rather than imported:
 * a private helper stays private to its own surface, and the two files agree
 * only because both round up for the same reason, telling somebody to wait
 * less than they must is worse than telling them to wait a little more.
 */
function _minutes(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/**
 * Turns a refusal on My account into the sentence somebody reads.
 *
 * Name conflicts and invalid names use the same field guidance as profile
 * completion. Device and rate-limit failures retain their specific remedies;
 * other failures use the retry sentence.
 */
export function accountFailure(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "name_taken")
      return "That name is already taken. Try adding your last-name initial, like John M.";
    if (
      error.code === "invalid_request" &&
      error.details?.fieldErrors?.displayName !== undefined
    ) {
      return profileNameFailure(error);
    }
    if (error.code === "session_not_found") {
      return "That device had already gone.";
    }
    if (error.code === "rate_limited") {
      const wait =
        error.details?.retryAfterSeconds === undefined
          ? "a few minutes"
          : _minutes(error.details.retryAfterSeconds);
      return `That did not save: you have changed things several times just now. Wait ${wait} and try again.`;
    }
  }
  return "That did not save. Try again.";
}

/**
 * A device list that did not arrive.
 *
 * Deliberately not a case inside `accountFailure`. Every sentence that
 * function can return is about a write that did not land, down to its
 * fallback ("That did not save. Try again."), and this is a read that did
 * not: telling somebody their devices did not save would be false as well as
 * confusing. It lives here rather than at the call site so that all of this
 * surface's copy is still in one file.
 *
 * A constant rather than a function of the error, because unlike a save there
 * is exactly one thing to do about it whatever the code, and that thing is
 * the button rendered beside this sentence.
 */
export const DEVICE_LIST_FAILURE = "We could not fetch your devices just now.";
