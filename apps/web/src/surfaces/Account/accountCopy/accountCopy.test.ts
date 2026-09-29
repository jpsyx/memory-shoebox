import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/client/client";
import { accountFailure } from "@/surfaces/Account/accountCopy/accountCopy";

/** One refusal off the wire, as `apiFetch` would have thrown it. */
function _refusal(options: {
  status: number;
  code: string;
  details?: Record<string, unknown>;
}): ApiRequestError {
  return new ApiRequestError({
    status: options.status,
    code: options.code,
    message: "English, for a log.",
    details: options.details,
  });
}

describe("accountFailure", () => {
  it("says the name is too long, in the space we have", () => {
    const failure = accountFailure(
      _refusal({
        status: 400,
        code: "invalid_request",
        details: { fieldErrors: { displayName: ["Too long"] } },
      }),
    );

    expect(failure).toBe(
      "That is longer than the space we have. Eighty characters at most.",
    );
  });

  it("says a device had already gone, on a 404 signing it out", () => {
    const failure = accountFailure(
      _refusal({ status: 404, code: "session_not_found" }),
    );

    expect(failure).toBe("That device had already gone.");
  });

  it("blames nothing specific for anything else, including a dropped call", () => {
    for (const error of [
      _refusal({ status: 500, code: "internal_error" }),
      _refusal({ status: 400, code: "invalid_request" }),
      new TypeError("Failed to fetch"),
    ]) {
      expect(accountFailure(error)).toBe("That did not save. Try again.");
    }
  });
});
