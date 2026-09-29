import { ApiRequestError } from "@/api/client/client";
import type { SignInState } from "@/surfaces/SignIn/signInState.types";

/** Which field a refusal belongs under, or the form when it belongs to none. */
export type SignInFailureField = "email" | "code" | "form";

/** One refusal, as the surface shows it. */
export type SignInFailure = {
  field: SignInFailureField;
  /** The sentence somebody reads. Never the envelope's English `message`. */
  message: string;
  /** The state this failure moves the surface to, when it moves it. */
  nextState: SignInState | undefined;
};

/** The line at the top of the card. */
/** Whatever is wrong when nothing more specific is known. */
const OUR_FAULT: SignInFailure = {
  field: "form",
  message: "Something went wrong at our end. Try again in a moment.",
  nextState: undefined,
};

export function signInLede(options: {
  state: SignInState;
  shoeboxName: string;
}): string {
  switch (options.state) {
    case "email":
      return `Sign in to ${options.shoeboxName}.`;
    case "link":
      return `Somebody sent you a link into ${options.shoeboxName}.`;
    default:
      return "Check your email.";
  }
}

/**
 * "One try" or "Two tries", in words, the way the mockup says it.
 *
 * The number comes off the response and never from a constant: the server
 * reads it off the row **after** the increment, so three tries means the first
 * wrong code gives two. Callers guard the case where the server sent no
 * number at all; this function is never asked to guess one.
 */
function _triesLeft(attemptsRemaining: number): string {
  if (attemptsRemaining === 1) {
    return "One try left";
  }
  if (attemptsRemaining === 2) {
    return "Two tries left";
  }
  return `${attemptsRemaining} tries left`;
}

/**
 * The `sign_in_code_invalid` failure, with or without a tries-left count.
 *
 * `attemptsRemaining` is `.optional()` on the wire (`packages/shared/src/errors.ts`),
 * so a value that is absent is possible even though the server always sends
 * one today. When it is absent, the sentence says no number at all rather
 * than guessing: the truth might be one try left or ten, and guessing short
 * means the interface has lied.
 */
function _signInCodeInvalidFailure(
  attemptsRemaining: number | undefined,
): SignInFailure {
  return {
    field: "code",
    message:
      attemptsRemaining === undefined
        ? "That is not the code in the email. Check the newest email and try again."
        : `That is not the code in the email. ${_triesLeft(
            attemptsRemaining,
          )} before we send you a new one.`,
    nextState: "wrong",
  };
}

/**
 * Whole minutes, rounded up and never below one.
 *
 * Up rather than down because telling somebody to wait less than they must is
 * worse than telling them to wait a little more: they try again, they are
 * refused again, and the interface has lied to them once. Takes a defined
 * number always; a caller that has none says "a few minutes" instead of
 * asking this function to guess it.
 */
function _minutes(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/**
 * The `rate_limited` failure, worded differently for each route.
 *
 * `retryAfterSeconds` is `.optional()` on the wire, so a value that is absent
 * is possible even though the server always sends one today. When it is
 * absent, the wait is "a few minutes": long enough to not be a lie, and
 * precise about nothing it does not know.
 */
function _rateLimitedFailure(options: {
  action: "mint" | "redeem";
  retryAfterSeconds: number | undefined;
}): SignInFailure {
  const { action, retryAfterSeconds } = options;
  const wait =
    retryAfterSeconds === undefined
      ? "a few minutes"
      : _minutes(retryAfterSeconds);

  if (action === "mint") {
    const prefix =
      retryAfterSeconds === undefined
        ? "You have asked for a code several times just now. "
        : "";
    return {
      field: "form",
      message: `${prefix}Wait ${wait}, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.`,
      nextState: undefined,
    };
  }

  return {
    field: "code",
    message: `Too many tries. Wait ${wait} and try the code again.`,
    nextState: undefined,
  };
}

/** The validation failure, put under whichever field it is about. */
function _invalidRequestFailure(error: ApiRequestError): SignInFailure {
  const fieldErrors = error.details?.fieldErrors ?? {};
  if (fieldErrors.email !== undefined) {
    return {
      field: "email",
      message: "That does not look like an email address.",
      nextState: undefined,
    };
  }
  if (fieldErrors.code !== undefined) {
    return {
      field: "code",
      message: "The code is six digits.",
      nextState: undefined,
    };
  }
  return OUR_FAULT;
}

/**
 * Turns a refusal into the sentence somebody reads.
 *
 * **Nothing here can mention membership**, because nothing here knows it.
 * Every one of these is reached identically by a member and by an address
 * nobody has ever heard of: the unknown address has a real row with a real
 * hash, so it counts down from three tries and expires after ten minutes
 * exactly as a member's does.
 *
 * @param options.error Whatever was thrown: an `ApiRequestError`, or a
 *   dropped call, which is not one.
 * @param options.action Which call failed. A rate limit means different things
 *   on the two, so it reads differently.
 */
export function signInFailure(options: {
  error: unknown;
  action: "mint" | "redeem";
}): SignInFailure {
  const { error, action } = options;
  if (!(error instanceof ApiRequestError)) {
    return OUR_FAULT;
  }

  switch (error.code) {
    case "sign_in_code_invalid":
      return _signInCodeInvalidFailure(error.details?.attemptsRemaining);

    case "sign_in_code_expired":
      return {
        field: "code",
        message:
          "That code has expired. They last ten minutes. Send another and use the newest email.",
        nextState: "expired",
      };

    case "sign_in_code_attempts_exhausted":
      return {
        field: "code",
        message:
          "That was the last try, so that code has stopped working. A new one is on its way.",
        nextState: "resent",
      };

    case "rate_limited":
      return _rateLimitedFailure({
        action,
        retryAfterSeconds: error.details?.retryAfterSeconds,
      });

    case "invalid_request":
      return _invalidRequestFailure(error);

    default:
      return OUR_FAULT;
  }
}
