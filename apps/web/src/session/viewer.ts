import { queryOptions } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

/**
 * Who is looking.
 *
 * A narrower thing than the server's request context in `conventions.md`
 * § The request context: the browser never needs `sessionId` or the expanded
 * `visibleRuleIds`, and carrying either would put the visibility predicate's
 * inputs on the wire for no reason.
 */
export type Viewer = {
  readonly memberId: string;
  readonly displayName: string;
  readonly role: "viewer" | "uploader" | "admin";
  readonly isAdmin: boolean;
};

/**
 * The placeholder viewer this step signs in as.
 *
 * **This is the seam.** Step 4b replaces the query function below with
 * `apiFetch({ path: "/me", schema: meResponseSchema })` and deletes this
 * constant; nothing else in the application changes, because everything that
 * needs a viewer already reads it through `viewerQueryOptions`.
 *
 * Step 3b builds the shell and the guard's shape, not the session. Step 3a
 * owns sessions and `GET /api/me` does not exist yet.
 */
const PLACEHOLDER_VIEWER: Viewer = {
  memberId: "00000000-0000-7000-8000-000000000000",
  displayName: "Papá",
  role: "admin",
  isAdmin: true,
};

/**
 * Query for the signed-in viewer.
 *
 * Exported as shared query options rather than a hook, so the same definition
 * serves a component, a route's `beforeLoad`, or a prefetch.
 */
export const viewerQueryOptions = queryOptions({
  queryKey: ["viewer"],
  queryFn: (): Promise<Viewer | undefined> => {
    return Promise.resolve(PLACEHOLDER_VIEWER);
  },
  staleTime: Infinity,
});

/**
 * The guard, and the whole of it.
 *
 * A URL in this product is an address rather than a credential, so an
 * unauthenticated request for one leads to the sign-in screen and then back to
 * where it was going (`PRODUCT.md` § Sharing). The pile is where sign-in lands
 * anyway, so a redirect to it is left off the search parameters rather than
 * written out.
 *
 * @throws A TanStack Router redirect when nobody is signed in.
 */
export function requireViewer(
  viewer: Viewer | undefined,
  attemptedHref: string,
): Viewer {
  if (viewer !== undefined) {
    return viewer;
  }
  throw redirect({
    to: "/sign-in",
    search: attemptedHref === "/" ? {} : { redirect: attemptedHref },
  });
}
