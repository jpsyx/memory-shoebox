import { redirect } from "@tanstack/react-router";
import type { MeResponse, ShellSettings } from "@memory-shoebox/shared";
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
 * What a signed-in route context holds: who is looking, and the three
 * instance settings the shell needs the moment it draws.
 *
 * The settings ride on `GET /api/me` rather than a second fetch, so a reload
 * has the same three values a fresh sign-in does (`auth.md` Ruling 1).
 */
export type SignedIn = Readonly<{
  viewer: Viewer;
  settings: ShellSettings;
}>;

/**
 * Narrows the account response to what the browser needs about the viewer.
 *
 * Deliberately lossy. The response carries an email address, a stored
 * display name, four notification switches and two timestamps, none of
 * which is anybody's business outside My account, and a `Viewer` handed down
 * through every route context would carry them everywhere.
 */
export function makeViewerFromMeResponse(me: MeResponse): Viewer {
  return {
    memberId: me.me.member.memberId,
    displayName: me.me.member.displayName,
    role: me.me.role,
    isAdmin: me.me.role === "admin",
  };
}

/**
 * The guard, and the whole of it.
 *
 * What it means to be signed in, in this module: two types (`Viewer` and
 * `SignedIn`), one narrowing function (`makeViewerFromMeResponse`), and this
 * guard, rather than only the guard.
 *
 * A URL in this product is an address rather than a credential, so an
 * unauthenticated request for one leads to the sign-in screen and then back to
 * where it was going (`PRODUCT.md` § Sharing). The pile is where sign-in lands
 * anyway, so a redirect to it is left off the search parameters rather than
 * written out.
 *
 * **It takes the whole response rather than a viewer**, which is a change from
 * what step 3b predicted. `MeResponse` carries the shell's settings beside the
 * account, and narrowing `MeResponse | null` in two places would mean
 * either a cast or a branch that cannot be reached. One narrowing point here
 * gives both consumers of the result, the viewer reader and the settings
 * reader, a value that is certainly present.
 *
 * @throws A TanStack Router redirect when nobody is signed in.
 */
export function requireSignedIn(options: {
  me: MeResponse | null;
  attemptedHref: string;
}): SignedIn {
  const { me, attemptedHref } = options;
  // `null` rather than `undefined`, which is what `meQueryOptions` has to
  // answer with: TanStack Query rejects a query function returning
  // `undefined` rather than caching it.
  if (me === null) {
    throw redirect({
      to: "/sign-in",
      search: attemptedHref === "/" ? {} : { redirect: attemptedHref },
    });
  }
  return { viewer: makeViewerFromMeResponse(me), settings: me.settings };
}
