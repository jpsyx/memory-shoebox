import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "./apiError.ts";

/**
 * Who is making this request.
 *
 * Frozen by `apis/conventions.md` § The request context, which also says
 * "assume it exists; do not design it". Every route reads it and no route
 * builds it.
 */
export type Viewer = {
  memberId: string;
  sessionId: string;
  role: "viewer" | "uploader" | "admin";
  isAdmin: boolean;
  /** Cached per (memberId, visibilityGeneration). */
  visibleRuleIds: readonly string[];
};

/**
 * Turns a request into a viewer, or into nothing.
 *
 * **Step 2 ships the seam and not the lookup.** The default returns null, and
 * step 3a replaces it with the session lookup, the throttled slide of
 * `sessions.last_used_at` and the `visibleRuleIds` cache. That split is what
 * lets rate limiting ship complete now: it reads the viewer when there is one
 * and falls back to the per-IP bucket when there is not, and neither branch
 * cares where the viewer came from.
 */
export type Authenticator = (request: FastifyRequest) => Promise<Viewer | null>;

declare module "fastify" {
  interface FastifyRequest {
    /** Null on an anonymous route, and before step 3a on every route. */
    viewer: Viewer | null;
  }
}

/** The authenticator a server with no session lookup yet runs. */
const anonymousAuthenticator: Authenticator = () => {
  return Promise.resolve(null);
};

/**
 * Attaches `request.viewer` before any handler runs.
 *
 * `onRequest` rather than `preHandler`, because it needs no body and because
 * the rate limiter, which does need one, has to be able to read the viewer.
 *
 * @param app The Fastify instance.
 * @param options.authenticate How to resolve a request to a viewer.
 */
export function registerRequestContext(
  app: FastifyInstance,
  options: { authenticate?: Authenticator } = {},
): void {
  const authenticate = options.authenticate ?? anonymousAuthenticator;

  app.decorateRequest("viewer", null);

  app.addHook("onRequest", async (request) => {
    request.viewer = await authenticate(request);
  });
}

/**
 * Returns the viewer, or fails the request with `401 not_signed_in`.
 *
 * The one exception in the whole product is `DELETE /api/auth/session`, which
 * `conventions.md` exempts because signing out is idempotent: a person
 * pressing "sign out" and being told they are not signed in has been failed by
 * the software rather than informed by it. That route must not call this.
 */
export function requireViewer(request: FastifyRequest): Viewer {
  if (request.viewer === null) {
    throw ApiError.notSignedIn();
  }
  return request.viewer;
}
