import type { MeResponse } from "@memory-shoebox/shared";

/** Current catalog, session and addressed route for the setup decision. */
export type SetupNavigationState = {
  isRequired: boolean;
  me: MeResponse | null;
  needsInvitations: boolean;
  pathname: string;
  attemptedUrl: string;
};
/** A destination; the optional redirect preserves an addressed app URL. */
export type SetupRedirect = {
  to: "/setup" | "/setup/invite" | "/sign-in" | "/";
  redirect?: string;
};

/** Single authority for first-run, sign-in and private invitation routing. */
export function getSetupRedirectFromNavigation(
  state: Readonly<SetupNavigationState>,
): SetupRedirect | undefined {
  const { isRequired, me, needsInvitations, pathname, attemptedUrl } = state;
  if (isRequired) {
    return pathname === "/setup" ? undefined : { to: "/setup" };
  }
  const isSetupPath = pathname === "/setup" || pathname === "/setup/invite";
  if (me === null) {
    if (pathname === "/sign-in" || pathname === "/join") {
      return undefined;
    }
    return {
      to: "/sign-in",
      ...(!isSetupPath && pathname !== "/" ? { redirect: attemptedUrl } : {}),
    };
  }
  if (me.me.role === "admin" && needsInvitations) {
    return pathname === "/setup/invite" ? undefined : { to: "/setup/invite" };
  }
  if (
    pathname === "/setup" ||
    (pathname === "/setup/invite" && me.me.role !== "admin")
  ) {
    return { to: "/" };
  }
  return undefined;
}
