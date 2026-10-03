import {
  createSessionResponseSchema,
  requestSignInCodeResponseSchema,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type RequestSignInCodeResponse,
} from "@memory-shoebox/shared";
import { z } from "zod";
import {
  ApiRequestError,
  apiFetch,
  jsonInit,
} from "@/api/clientHelpers/clientHelpers";

/**
 * Asks for a six-digit code at an address.
 *
 * **`isResend` picks the route rather than setting a flag on one.** The server
 * behaves identically either way, deliberately: a route that behaved
 * differently depending on whether a code was already outstanding would leak
 * that fact. The split exists so this client's state machine can tell "Send
 * another", which says plainly that the old code has stopped working, from a
 * first request (`auth.md`).
 *
 * Both routes share one per-address budget of five an hour, so a resend is not
 * a way round the cap.
 */
export function requestSignInCode(options: {
  email: string;
  isResend: boolean;
}): Promise<RequestSignInCodeResponse> {
  return apiFetch({
    path: options.isResend
      ? "/auth/sign-in-codes/resend"
      : "/auth/sign-in-codes",
    schema: requestSignInCodeResponseSchema,
    init: jsonInit({ method: "POST", body: { email: options.email } }),
  });
}

/**
 * Redeems a code into a session, which sets the cookie.
 *
 * The destination a `link`-state sign-in was heading for is not sent and never
 * reaches the server: the client keeps it and navigates there after the `201`.
 */
export function createSession(
  body: CreateSessionRequest,
): Promise<CreateSessionResponse> {
  return apiFetch({
    path: "/auth/session",
    schema: createSessionResponseSchema,
    init: jsonInit({ method: "POST", body }),
  });
}

/**
 * Signs out the device making the request.
 *
 * **It cannot fail on a dead cookie.** A cookie that is present but no longer
 * resolves to a live session answers `204` with the clearing header rather
 * than `401`. The server keeps a `401 not_signed_in` for the one case where
 * there is nothing at all to sign out of: no cookie was presented
 * (`apps/server/src/routes/auth.ts`, `auth.md`). From the member's side that
 * is not a failure either, so this function swallows that one code: a second
 * tab that lost its cookie must not show an error for pressing sign out.
 */
export async function deleteSession(): Promise<void> {
  try {
    await apiFetch({
      path: "/auth/session",
      schema: z.void(),
      init: { method: "DELETE" },
    });
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.code === "not_signed_in") {
      return;
    }
    throw error;
  }
}
