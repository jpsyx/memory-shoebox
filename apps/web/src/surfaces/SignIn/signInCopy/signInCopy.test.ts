import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  signInFailure,
  signInLede,
} from "@/surfaces/SignIn/signInCopy/signInCopy";

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

describe("signInLede", () => {
  it("names the Shoebox before anybody has asked for a code", () => {
    expect(signInLede({ state: "email", shoeboxName: "My Shoebox" })).toBe(
      "Sign in to My Shoebox.",
    );
  });

  it("says somebody sent a link, without saying who or what", () => {
    expect(signInLede({ state: "link", shoeboxName: "My Shoebox" })).toBe(
      "Somebody sent you a link into My Shoebox.",
    );
  });

  it("points at the inbox once a code is on its way", () => {
    for (const state of ["sent", "wrong", "expired", "resent"] as const) {
      expect(signInLede({ state, shoeboxName: "My Shoebox" })).toBe(
        "Check your email.",
      );
    }
  });
});

describe("signInFailure", () => {
  it("counts the tries down in words, from the response and not a constant", () => {
    const failure = signInFailure({
      error: _refusal({
        status: 401,
        code: "sign_in_code_invalid",
        details: { attemptsRemaining: 2 },
      }),
      action: "redeem",
    });

    expect(failure).toEqual({
      field: "code",
      message:
        "That is not the code in the email. Two tries left before we send you a new one.",
      nextState: "wrong",
    });
  });

  it("uses the singular on the last try", () => {
    const failure = signInFailure({
      error: _refusal({
        status: 401,
        code: "sign_in_code_invalid",
        details: { attemptsRemaining: 1 },
      }),
      action: "redeem",
    });

    expect(failure.message).toBe(
      "That is not the code in the email. One try left before we send you a new one.",
    );
  });

  it("says no number at all when the server sends no attemptsRemaining", () => {
    const failure = signInFailure({
      error: _refusal({ status: 401, code: "sign_in_code_invalid" }),
      action: "redeem",
    });

    expect(failure).toEqual({
      field: "code",
      message:
        "That is not the code in the email. Check the newest email and try again.",
      nextState: "wrong",
    });
  });

  it("says what expired, how long they last, and which email to use", () => {
    const failure = signInFailure({
      error: _refusal({ status: 410, code: "sign_in_code_expired" }),
      action: "redeem",
    });

    expect(failure).toEqual({
      field: "code",
      message:
        "That code has expired. They last ten minutes. Send another and use the newest email.",
      nextState: "expired",
    });
  });

  it("promises the new code the server has already sent", () => {
    const failure = signInFailure({
      error: _refusal({
        status: 410,
        code: "sign_in_code_attempts_exhausted",
      }),
      action: "redeem",
    });

    expect(failure).toEqual({
      field: "code",
      message:
        "That was the last try, so that code has stopped working. A new one is on its way.",
      nextState: "resent",
    });
  });

  it("turns a rate limit into minutes, differently for each route", () => {
    expect(
      signInFailure({
        error: _refusal({
          status: 429,
          code: "rate_limited",
          details: { retryAfterSeconds: 1800 },
        }),
        action: "mint",
      }),
    ).toEqual({
      field: "form",
      message:
        "Wait 30 minutes, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.",
      nextState: undefined,
    });

    expect(
      signInFailure({
        error: _refusal({
          status: 429,
          code: "rate_limited",
          details: { retryAfterSeconds: 60 },
        }),
        action: "redeem",
      }).message,
    ).toBe("Too many tries. Wait 1 minute and try the code again.");
  });

  it("says no number at all when the server sends no retryAfterSeconds, minting", () => {
    expect(
      signInFailure({
        error: _refusal({ status: 429, code: "rate_limited" }),
        action: "mint",
      }),
    ).toEqual({
      field: "form",
      message:
        "You have asked for a code several times just now. Wait a few minutes, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.",
      nextState: undefined,
    });
  });

  it("says no number at all when the server sends no retryAfterSeconds, redeeming", () => {
    expect(
      signInFailure({
        error: _refusal({ status: 429, code: "rate_limited" }),
        action: "redeem",
      }).message,
    ).toBe("Too many tries. Wait a few minutes and try the code again.");
  });

  it("rounds a part minute up, because waiting less than told is worse", () => {
    expect(
      signInFailure({
        error: _refusal({
          status: 429,
          code: "rate_limited",
          details: { retryAfterSeconds: 61 },
        }),
        action: "redeem",
      }).message,
    ).toBe("Too many tries. Wait 2 minutes and try the code again.");
  });

  it("puts a validation failure on the field it is about", () => {
    expect(
      signInFailure({
        error: _refusal({
          status: 400,
          code: "invalid_request",
          details: { fieldErrors: { email: ["Invalid email"] } },
        }),
        action: "mint",
      }),
    ).toEqual({
      field: "email",
      message: "That does not look like an email address.",
      nextState: undefined,
    });

    expect(
      signInFailure({
        error: _refusal({
          status: 400,
          code: "invalid_request",
          details: { fieldErrors: { code: ["Not six digits"] } },
        }),
        action: "redeem",
      }).message,
    ).toBe("The code is six digits.");
  });

  it("blames our end for anything it does not recognise, never the address", () => {
    for (const error of [
      _refusal({ status: 500, code: "internal_error" }),
      new TypeError("Failed to fetch"),
    ]) {
      expect(signInFailure({ error, action: "mint" })).toEqual({
        field: "form",
        message: "Something went wrong at our end. Try again in a moment.",
        nextState: undefined,
      });
    }
  });
});
