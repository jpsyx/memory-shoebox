import type { ApiErrorDetails } from "@memory-shoebox/shared";

/**
 * The closed set of statuses a failure may carry.
 *
 * Eight of them are the table in `apis/conventions.md` § Errors, which is the
 * whole list of refusals this API makes on purpose. `500` is in the union and
 * not in that document deliberately: the table covers deliberate refusals, and
 * a `500` is the absence of a contract rather than a part of one, so it has no
 * row to sit in even though the error handler still needs a status to send.
 */
export type ApiErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 410
  | 429
  | 500
  | 503;

/**
 * The parts of one failure, as `ApiError`'s constructor receives them.
 *
 * `statusCode` is the closed union above. `code` is the stable `snake_case`
 * string the client branches on, `message` is English for a log or a fallback,
 * and `details` is one of the three documented structured cases.
 */
export type ApiErrorOptions = {
  statusCode: ApiErrorStatus;
  code: string;
  message: string;
  details?: ApiErrorDetails;
};

/**
 * One failure, in the shape every route returns
 * (`apis/conventions.md` § Errors).
 *
 * `code` is a stable `snake_case` string the client branches on, named
 * `<domain>_<condition>`. `message` is English, for a log or a fallback, and
 * is never the primary interface copy. `details` carries the three documented
 * structured cases and nothing else.
 *
 * The named constructors exist so that the status table lives in one place. A
 * handler that writes `new ApiError(404, ...)` by hand is how the 403/404 line
 * gets blurred, and that line is the counting rule: **404 means you may not
 * see it, 403 means you can see it and may not do it.**
 */
export class ApiError extends Error {
  readonly statusCode: ApiErrorStatus;
  readonly code: string;
  readonly details: ApiErrorDetails | undefined;

  /**
   * Builds a failure from a status the contract names.
   *
   * Prefer one of the named constructors below whenever one fits. They are
   * what hold the status table together: each fixes the status for one kind
   * of refusal, so the table lives here rather than spread across the routes.
   * `statusCode` is a closed union (`ApiErrorStatus`) so that a caller who
   * does come here directly still cannot invent a status the contract has no
   * row for.
   */
  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }

  /** `400`: malformed, or failed validation. */
  static invalidRequest(
    fieldErrors: Record<string, readonly string[]>,
  ): ApiError {
    return new ApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "The request was not valid.",
      details: { fieldErrors: fieldErrors as Record<string, string[]> },
    });
  }

  /** `401`: no session, or an expired one. */
  static notSignedIn(): ApiError {
    return new ApiError({
      statusCode: 401,
      code: "not_signed_in",
      message: "This request needs a signed-in session.",
    });
  }

  /**
   * `403`: **role or capability only**. The viewer can see the thing and may
   * not do it. Anything they may not see is a 404 instead, always.
   */
  static forbidden(code: string): ApiError {
    return new ApiError({
      statusCode: 403,
      code,
      message: "Your role does not allow this.",
    });
  }

  /**
   * `404`: it does not exist, **or the viewer may not see it**. The two are
   * byte-identical on the wire, which is what stops a 403 confirming that
   * something exists at an id.
   */
  static notFound(code: string): ApiError {
    return new ApiError({
      statusCode: 404,
      code,
      message: "Not found.",
    });
  }

  /** `409`: a state conflict. */
  static conflict(code: string): ApiError {
    return new ApiError({
      statusCode: 409,
      code,
      message: "That conflicts with the current state.",
    });
  }

  /** `410`: a sign-in code that has expired or been superseded. */
  static gone(code: string): ApiError {
    return new ApiError({
      statusCode: 410,
      code,
      message: "That is no longer available.",
    });
  }

  /** `429`: rate limited, carrying the seconds until a retry may work. */
  static rateLimited(retryAfterSeconds: number): ApiError {
    return new ApiError({
      statusCode: 429,
      code: "rate_limited",
      message: "Too many requests.",
      details: { retryAfterSeconds },
    });
  }

  /** `503`: a third party is down while the database is fine. */
  static unavailable(code: string): ApiError {
    return new ApiError({
      statusCode: 503,
      code,
      message: "A service this route depends on is unavailable.",
    });
  }
}
