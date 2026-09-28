import type { ApiErrorDetails } from "@memory-shoebox/shared";

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
  readonly statusCode: number;
  readonly code: string;
  readonly details: ApiErrorDetails | undefined;

  constructor(options: {
    statusCode: number;
    code: string;
    message: string;
    details?: ApiErrorDetails;
  }) {
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
