import { queryOptions } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import type { MemberRole } from "@/system/memberRole";

/**
 * Who is looking.
 *
 * A narrower thing than the server's request context in `conventions.md`
 * § The request context: the browser never needs `sessionId` or the expanded
 * `visibleRuleIds`, and carrying either would put the visibility predicate's
 * inputs on the wire for no reason.
 *
 * Its fields stay `readonly` on the alias itself rather than only at a
 * function boundary: a `Viewer` is a shared reference to who is signed in,
 * handed through route context and down into every component that reads it,
 * and a mutation anywhere along that path would be a bug rather than a
 * legitimate use.
 */
export type Viewer = Readonly<{
  memberId: string;
  displayName: string;
  role: MemberRole;
  isAdmin: boolean;
}>;

/**
 * The placeholder viewer this shell signs in as until real sessions exist.
 *
 * **This is the seam.** Replacing this with a call to `GET /api/me` means
 * deleting this constant and rewriting the query function below;
 * everything that needs a viewer already reads it through
 * `viewerQueryOptions`, so nothing else moves.
 *
 * **One thing that replacement has to get right.** `GET /api/me` answers 401
 * when nobody is signed in, and `apiFetch` turns a 401 into a thrown
 * `ApiRequestError`. A rejected query in `beforeLoad` surfaces as a route
 * error, not as the redirect below: `requireViewer` only ever sees a value.
 * So the real query function has to catch `not_signed_in` and resolve
 * `undefined`, which is what its `Viewer | undefined` return type is for.
 *
 * This constant stands in for a session the server does not yet expose:
 * `GET /api/me` does not exist yet, so there is nothing real to sign in as.
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
export function requireViewer(options: {
  viewer: Viewer | undefined;
  attemptedHref: string;
}): Viewer {
  const { viewer, attemptedHref } = options;
  if (viewer !== undefined) {
    return viewer;
  }
  throw redirect({
    to: "/sign-in",
    search: attemptedHref === "/" ? {} : { redirect: attemptedHref },
  });
}
