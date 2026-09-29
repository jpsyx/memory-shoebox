import {
  listMySessionsResponseSchema,
  meResponseSchema,
  type ListMySessionsResponse,
  type MeResponse,
  type UpdateMeRequest,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ApiRequestError, apiFetch, jsonInit } from "@/api/client/client";

/** Who is signed in. The guard and My account read this one entry. */
export const ME_QUERY_KEY = ["me"] as const;

/**
 * This member's live devices.
 *
 * Nested under the account's key, which mirrors `/api/me/sessions` and means
 * invalidating `ME_QUERY_KEY` invalidates this too. That cascade is harmless
 * (a device list is one small query) but it is not free: a caller that wants
 * only the account entry has to pass `exact: true`.
 */
export const MY_SESSIONS_QUERY_KEY = ["me", "sessions"] as const;

/**
 * Query for `GET /api/me`, answering `null` when nobody is signed in.
 *
 * **The catch is load-bearing.** The route answers `401 not_signed_in` and
 * `apiFetch` turns that into a thrown `ApiRequestError`. A rejected query in a
 * route's `beforeLoad` surfaces as a route error rather than as the guard's
 * redirect, so the one refusal that is really an answer is turned back into a
 * value here. Every other failure still throws, because every other failure is
 * a fault rather than an answer.
 *
 * **`null` rather than the `undefined` this codebase otherwise prefers**, and
 * this is the exception `docs/rules/typescript.md` allows for a value a
 * library requires. TanStack Query treats `undefined` as "this query has no
 * data" rather than as data, and rejects a query function that returns it:
 *
 * ```
 * Query data cannot be undefined. Please make sure to return a value other
 * than undefined from your query function. Affected query key: ["me"]
 * ```
 *
 * That rejection is the whole reason for the choice. It does not happen when
 * the query function is called directly, only when it runs through a query
 * client, so returning `undefined` here turned every guarded route reached
 * while signed out into an error screen instead of a redirect to sign-in,
 * while three test files went on passing. `rendering.test.tsx` § a guarded
 * route reached while signed out is the standing guard.
 */
export const meQueryOptions = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await apiFetch({ path: "/me", schema: meResponseSchema });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.code === "not_signed_in") {
        return null;
      }
      throw error;
    }
  },
  staleTime: Infinity,
});

/**
 * Corrects the display name, or sets all four notification switches.
 *
 * Every field is optional and an omitted one is left alone, but `notify` is
 * all four or none: requiring them together is what keeps a partial write from
 * looking like the "turn them all off" the button sends. There is no fifth
 * switch, no `notifyAll` column and no bulk route (Decision 16).
 *
 * `email` and `role` are not writable here or anywhere, and a request carrying
 * either is rejected rather than ignored, so a client bug surfaces at once.
 */
export function updateMe(body: UpdateMeRequest): Promise<MeResponse> {
  return apiFetch({
    path: "/me",
    schema: meResponseSchema,
    init: jsonInit("PATCH", body),
  });
}

/**
 * Query for `GET /api/me/sessions`: this member's live devices, newest use
 * first.
 *
 * `nextCursor` is always null, because a member holds a handful of devices
 * bounded by the 30-day expiry. `isCurrent` is computed at the boundary from
 * the requesting session and is what the surface turns into "this one".
 */
export const mySessionsQueryOptions = queryOptions({
  queryKey: MY_SESSIONS_QUERY_KEY,
  queryFn: (): Promise<ListMySessionsResponse> => {
    return apiFetch({
      path: "/me/sessions",
      schema: listMySessionsResponseSchema,
    });
  },
});

/**
 * Signs one of this member's own devices out.
 *
 * It stops working immediately, wherever it is, because the middleware looks
 * the session up in the database on every request. That is the promise the
 * Account banner makes about a lost or handed-down phone.
 *
 * A `404 session_not_found` means the row is not there **or is not theirs**,
 * which are deliberately the same answer: a `403` would confirm that a session
 * exists at that id.
 */
export function revokeMySession(sessionId: string): Promise<void> {
  return apiFetch({
    path: `/me/sessions/${encodeURIComponent(sessionId)}`,
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
