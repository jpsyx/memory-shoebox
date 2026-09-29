import { apiErrorSchema, type ApiErrorDetails } from "@memory-shoebox/shared";
import type { z } from "zod";

/**
 * The API lives under `/api` on the same origin as the app: in production one
 * Fastify process serves both, and in development Vite proxies this prefix to
 * the API server. There is deliberately no configurable base URL.
 */
const API_BASE_PATH = "/api";

/**
 * The parts of one failure, as `ApiRequestError`'s constructor receives
 * them.
 */
type ApiRequestErrorOptions = {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetails;
};

/**
 * Thrown when the API answers with a non-2xx status.
 *
 * `code` is the stable `snake_case` code and is what a caller branches on.
 * `details` carries the three structured cases the envelope has: `fieldErrors`
 * on a 400, `retryAfterSeconds` on a 429, and `attemptsRemaining` on a
 * sign-in code. `message` is English, for a log or a fallback, and is
 * **never** the primary UI copy (`conventions.md` § Errors).
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetails | undefined;

  constructor(options: Readonly<ApiRequestErrorOptions>) {
    super(options.message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

/** Turns a failed response into an ApiRequestError, whatever its body holds. */
async function _toRequestError(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => {
    return undefined;
  });
  const parsed = apiErrorSchema.safeParse(body);
  return new ApiRequestError({
    status: response.status,
    code: parsed.success ? parsed.data.error : "unknown_error",
    message: parsed.success
      ? parsed.data.message
      : `Request failed with status ${response.status}`,
    details: parsed.success ? parsed.data.details : undefined,
  });
}

/**
 * A request carrying a JSON body.
 *
 * Here rather than in each caller because the header and the stringify are
 * one convention, and two copies of a convention is one convention and one
 * thing to get wrong.
 */
export function jsonInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * Calls the Memory Shoebox API and validates the response against a schema.
 *
 * Every response is parsed with the schema from `@memory-shoebox/shared` rather than
 * trusted, so a server and client that have drifted apart fail loudly at the
 * boundary instead of producing undefined deep inside a component.
 *
 * @param options.path Path below `/api`, for example "/health".
 * @param options.schema Schema the response body must satisfy.
 * @param options.init Extra fetch options, for example a method or body.
 * @returns The parsed response body.
 * @throws ApiRequestError if the request fails, or a ZodError if the body does
 *   not match the schema.
 */
export async function apiFetch<TSchema extends z.ZodType>(options: {
  path: string;
  schema: TSchema;
  init?: RequestInit;
}): Promise<z.infer<TSchema>> {
  const response = await fetch(`${API_BASE_PATH}${options.path}`, {
    // Send the session cookie on every call, including cross-tab navigations.
    credentials: "same-origin",
    ...options.init,
  });

  if (!response.ok) {
    throw await _toRequestError(response);
  }

  // A 204 has no body to read, and `response.json()` on an empty one throws
  // a bare SyntaxError rather than anything a caller can branch on. The
  // contract answers 204 wherever there is genuinely nothing to return,
  // which today is signing out and taking a reaction off. Such a call
  // passes `z.void()` and gets `undefined`; one that passes a real schema
  // gets a ZodError, which is the right answer, because a route that was
  // supposed to return a resource and returned nothing is a contract the
  // two halves no longer agree on.
  return response.status === 204
    ? options.schema.parse(undefined)
    : options.schema.parse(await response.json());
}
