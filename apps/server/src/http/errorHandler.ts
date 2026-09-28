import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { ApiError as ApiErrorBody } from "@memory-shoebox/shared";
import { ApiError, type ApiErrorStatus } from "./apiError.ts";

/** Groups Zod issues by the field they came from, the way `details` wants. */
function _fieldErrorsFromZod(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    // An issue on the root has an empty path. It is still a field error as far
    // as the client is concerned, so it gets a name rather than being dropped.
    const field = issue.path.length === 0 ? "_" : issue.path.join(".");
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return fieldErrors;
}

/** Groups Fastify's JSON Schema validation errors the same way. */
function _fieldErrorsFromFastify(
  validation: NonNullable<FastifyError["validation"]>,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of validation) {
    const field = issue.instancePath.replace(/^\//, "").replace(/\//g, ".");
    const name = field === "" ? "_" : field;
    fieldErrors[name] = [
      ...(fieldErrors[name] ?? []),
      issue.message ?? "is not valid",
    ];
  }
  return fieldErrors;
}

/**
 * Collapses a framework-supplied 4xx onto the contract's closed status set.
 *
 * `conventions.md` § Errors names eight statuses, and Fastify can produce
 * others: 405 on a method mismatch, 413 on an oversized body, 415 on a media
 * type the parser does not know. None of those is in the contract, and the
 * honest answer for all of them is the one the contract already has for a
 * request it cannot act on: `400 invalid_request`. A `switch` rather than a
 * `Set` because it narrows, so the mapping needs no cast.
 */
function _contractStatus(status: number): ApiErrorStatus {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 409:
    case 410:
    case 429:
    case 503:
      return status;
    default:
      return 400;
  }
}

/** Translates whatever was thrown into the one error shape. */
function _toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof ZodError) {
    return ApiError.invalidRequest(_fieldErrorsFromZod(error));
  }

  // A route can throw something that is not an object at all (`throw null`, a
  // string, a rejected promise with no reason). Reading a property off that
  // would throw inside the error handler itself, and Fastify would answer with
  // its own shape carrying the TypeError's message: exactly the leak this
  // handler exists to prevent.
  const fastifyError = (
    typeof error === "object" && error !== null ? error : {}
  ) as Partial<FastifyError>;
  if (fastifyError.validation !== undefined) {
    return ApiError.invalidRequest(
      _fieldErrorsFromFastify(fastifyError.validation),
    );
  }
  // A malformed body, an unsupported media type and a too-large payload all
  // arrive as Fastify errors with a 4xx on them. They are the client's
  // mistake, so they become `invalid_request`.
  if (
    typeof fastifyError.statusCode === "number" &&
    fastifyError.statusCode >= 400 &&
    fastifyError.statusCode < 500
  ) {
    return new ApiError({
      statusCode: _contractStatus(fastifyError.statusCode),
      code: "invalid_request",
      // The framework's own status is carried in `message`, which is
      // returned to the caller, so a collapsed 413 stays diagnosable from the
      // response itself. Nothing logs it: the handler logs at `error` only
      // for a 5xx, because a refusal the contract has a code for is the
      // contract working rather than something going wrong.
      message: `The request was not valid (${fastifyError.statusCode}).`,
    });
  }

  return new ApiError({
    statusCode: 500,
    code: "internal_error",
    message: "Something went wrong.",
  });
}

/**
 * Installs the one error envelope every failing route returns
 * (`apis/conventions.md` § Errors).
 *
 * Two things it deliberately does. It **never** puts an unexpected error's
 * own message on the wire: `message` is English for a log or a fallback, and a
 * database error's text is a description of the schema. And it logs at `error`
 * only for a 5xx, because a 404 or a 429 is the contract working rather than
 * something going wrong, and a log line per rate-limited request is how a log
 * becomes unreadable on the day it matters.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const apiError = _toApiError(error);

    if (apiError.statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    }

    const body: ApiErrorBody = {
      error: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    };

    const retryAfterSeconds = apiError.details?.retryAfterSeconds;
    if (retryAfterSeconds !== undefined) {
      void reply.header("retry-after", String(retryAfterSeconds));
    }

    return reply.code(apiError.statusCode).type("application/json").send(body);
  });
}
