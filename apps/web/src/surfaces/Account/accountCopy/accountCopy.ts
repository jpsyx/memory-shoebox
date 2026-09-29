import { ApiRequestError } from "@/api/client/client";

/** Turns a refusal on My account into the sentence somebody reads. */
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
  }
  return "That did not save. Try again.";
}
