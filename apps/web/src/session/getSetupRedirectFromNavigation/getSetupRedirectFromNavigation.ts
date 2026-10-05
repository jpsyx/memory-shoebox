import type { MeResponse } from "@memory-shoebox/shared";

/** Current catalog, session and addressed route for the setup decision. */
export type SetupNavigationState = {
  isRequired: boolean;
  me: MeResponse | undefined;
  needsInvitations: boolean;
  pathname: string;
  attemptedUrl: string;
};

/** Single authority for first-run, sign-in and private invitation routing. */
export function getSetupRedirectFromNavigation(
  state: Readonly<SetupNavigationState>,
):
  | {
      to: "/setup" | "/setup/invite" | "/sign-in" | "/";
      redirect?: string;
    }
  | undefined {
  const { isRequired, me, needsInvitations, pathname, attemptedUrl } = state;
  if (isRequired) {
    return pathname === "/setup" ? undefined : { to: "/setup" };
  }
  const isSetupPath = pathname === "/setup" || pathname === "/setup/invite";
  if (me === undefined) {
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
  return pathname === "/setup" ||
    (pathname === "/setup/invite" && me.me.role !== "admin")
    ? { to: "/" }
    : undefined;
}
