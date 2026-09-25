import { apiErrorSchema } from "@famgram/shared";
import type { z } from "zod";

/**
 * The API lives under `/api` on the same origin as the app: in production one
 * Fastify process serves both, and in development Vite proxies this prefix to
 * the API server. There is deliberately no configurable base URL.
 */
const API_BASE_PATH = "/api";

/** Thrown when the API answers with a non-2xx status. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(options: { status: number; code: string; message: string }) {
    super(options.message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
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
  });
}

/**
 * Calls the Famgram API and validates the response against a schema.
 *
 * Every response is parsed with the schema from `@famgram/shared` rather than
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

  return options.schema.parse(await response.json());
}
