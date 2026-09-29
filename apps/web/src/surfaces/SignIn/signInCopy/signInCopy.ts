import { ApiRequestError } from "@/api/client/client";

/**
 * The states surface 1 can be in.
 *
 * **Six, not the seven the design spec's surface table lists.** `unknown` is
 * not one: `POST /api/auth/sign-in-codes` answers the same `202` for a member
 * and for an address nobody has heard of, so the client cannot compute the
 * difference and must never appear to. The conditional wording below is the
 * only correct copy for every outcome of that route (`auth.md`, "The copy
 * correction this route forces").
 */
export type SignInState =
  | "link"
  | "email"
  | "sent"
  | "wrong"
  | "expired"
  | "resent";

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
 * wrong code gives two.
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
 * Whole minutes, rounded up and never below one.
 *
 * Up rather than down because telling somebody to wait less than they must is
 * worse than telling them to wait a little more: they try again, they are
 * refused again, and the interface has lied to them once.
 */
function _minutes(retryAfterSeconds: number | undefined): string {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Whatever is wrong when nothing more specific is known. */
const OUR_FAULT: SignInFailure = {
  field: "form",
  message: "Something went wrong at our end. Try again in a moment.",
  nextState: undefined,
};

/** The validation failure, put under whichever field it is about. */
function _invalidRequest(error: ApiRequestError): SignInFailure {
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
      return {
        field: "code",
        message: `That is not the code in the email. ${_triesLeft(
          error.details?.attemptsRemaining ?? 1,
        )} before we send you a new one.`,
        nextState: "wrong",
      };

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
      return action === "mint"
        ? {
            field: "form",
            message: `Wait ${_minutes(
              error.details?.retryAfterSeconds,
            )}, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.`,
            nextState: undefined,
          }
        : {
            field: "code",
            message: `Too many tries. Wait ${_minutes(
              error.details?.retryAfterSeconds,
            )} and try the code again.`,
            nextState: undefined,
          };

    case "invalid_request":
      return _invalidRequest(error);

    default:
      return OUR_FAULT;
  }
}
