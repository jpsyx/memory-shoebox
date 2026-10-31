import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";
import type { MeResponse } from "@memory-shoebox/shared";

/** Current catalog, session and addressed route for the setup decision. */
export type SetupNavigationState = {
  isRequired: boolean;
  me: MeResponse | undefined;
  needsInvitations: boolean;
  pathname: string;
  attemptedUrl: string;
};

function _getDestinationFromNavigation(
  state: Readonly<SetupNavigationState>,
): string {
  const { pathname, attemptedUrl } = state;
  return pathname === "/sign-in" ||
    pathname === "/join" ||
    pathname === "/complete-profile"
    ? makeSafeHrefFromRedirect(
        new URL(attemptedUrl, "http://local").searchParams.get("redirect") ??
          undefined,
      )
    : makeSafeHrefFromRedirect(attemptedUrl);
}

/** Single authority for first-run, sign-in and private invitation routing. */
export function getSetupRedirectFromNavigation(
  state: Readonly<SetupNavigationState>,
):
  | {
      to: "/setup" | "/setup/invite" | "/sign-in" | "/complete-profile" | "/";
      redirect?: string;
    }
  | undefined {
  const { isRequired, me, needsInvitations, pathname } = state;
  if (isRequired) {
    return pathname === "/setup" ? undefined : { to: "/setup" };
  }
  const destination = _getDestinationFromNavigation(state);
  const isSetupPath = pathname === "/setup" || pathname === "/setup/invite";
  if (me === undefined) {
    if (pathname === "/sign-in" || pathname === "/join") {
      return undefined;
    }
    return {
      to: "/sign-in",
      ...(!isSetupPath && pathname !== "/" ? { redirect: destination } : {}),
    };
  }
  if (!me.me.profileComplete) {
    return pathname === "/complete-profile"
      ? undefined
      : { to: "/complete-profile", redirect: destination };
  }
  if (pathname === "/complete-profile") {
    return undefined;
  }
  if (me.me.role === "admin" && needsInvitations) {
    return pathname === "/setup/invite" ? undefined : { to: "/setup/invite" };
  }
  return pathname === "/setup" ||
    (pathname === "/setup/invite" && me.me.role !== "admin")
    ? { to: "/" }
    : undefined;
}
