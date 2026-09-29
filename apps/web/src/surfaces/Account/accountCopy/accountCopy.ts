import { ApiRequestError } from "@/api/client/client";

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
 * Everything that is not one of the three named cases collapses into one
 * generic sentence, deliberately: this sheet has exactly one thing anybody
 * can retry (press the switch or the button again), so a name-saving field
 * error, an unrecognised code and a dropped call all read the same to the
 * member, "that did not save, try again", rather than the interface inventing
 * a distinction it cannot back up with a different action to take.
 */
export function accountFailure(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (
      error.code === "invalid_request" &&
      error.details?.fieldErrors?.displayName !== undefined
    ) {
      // `conventions.md` § String lengths: 80, "enough for Abuela Rosa, short
      // enough that a comment chip cannot be used as a billboard".
      return "That is longer than the space we have. Eighty characters at most.";
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
