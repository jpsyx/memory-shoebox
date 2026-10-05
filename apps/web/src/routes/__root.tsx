import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type { MeResponse } from "@memory-shoebox/shared";
import {
  setupStatusQueryOptions,
  setupProgressQueryOptions,
} from "@/api/setup/setup";
import { meQueryOptions } from "@/api/me/me";
import { getSetupRedirectFromNavigation } from "@/session/getSetupRedirectFromNavigation/getSetupRedirectFromNavigation";
import { SetupLoadError } from "@/surfaces/Setup/SetupLoadError";
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

/** Reads private progress only for the currently known admin account. */
async function _getSetupProgressFromAccount(
  options: Readonly<{
    queryClient: QueryClient;
    me: MeResponse | undefined;
  }>,
): Promise<{ me: MeResponse | undefined; needsInvitations: boolean }> {
  const { queryClient, me } = options;
  const progress =
    me?.me.role === "admin"
      ? await queryClient.fetchQuery(setupProgressQueryOptions)
      : { needsInvitations: false };
  return { me, ...progress };
}

/** Returns current identity and setup progress after authority is lost. */
async function _getCurrentSetupAccountProgressFromQueryClient(
  queryClient: QueryClient,
): Promise<{ me: MeResponse | undefined; needsInvitations: boolean }> {
  queryClient.clear();
  const me = await queryClient.fetchQuery({
    ...meQueryOptions,
    staleTime: 0,
    retry: false,
  });
  return _getSetupProgressFromAccount({ queryClient, me: me ?? undefined });
}

/** Reconciles stale admin authority without hiding genuine progress faults. */
async function _getSetupAccountProgressFromQueryClient(
  queryClient: QueryClient,
): Promise<{ me: MeResponse | undefined; needsInvitations: boolean }> {
  const me = await queryClient.query({
    ...meQueryOptions,
    staleTime: "static",
  });
  try {
    return await _getSetupProgressFromAccount({
      queryClient,
      me: me ?? undefined,
    });
  } catch (error: unknown) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      return _getCurrentSetupAccountProgressFromQueryClient(queryClient);
    }
    throw error;
  }
}

/**
 * First-run availability and private progress are checked before any shell.
 * Signed-out setup/sign-in and the signed-in app draw their own chrome.
 *
 * The query client rides in the router context so a route's `beforeLoad` can
 * read the viewer before its component mounts.
 */
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  beforeLoad: async ({ context, location, preload }) => {
    if (preload) {
      return {
        setupMe:
          context.queryClient.getQueryData(meQueryOptions.queryKey) ??
          undefined,
      };
    }
    const status = await context.queryClient.fetchQuery(
      setupStatusQueryOptions,
    );
    const accountProgress = status.isRequired
      ? { me: undefined, needsInvitations: false }
      : await _getSetupAccountProgressFromQueryClient(context.queryClient);
    const destination = getSetupRedirectFromNavigation({
      ...status,
      ...accountProgress,
      pathname: location.pathname,
      attemptedUrl: location.href,
    });
    if (destination !== undefined) {
      throw redirect({
        to: destination.to,
        search:
          destination.redirect === undefined
            ? {}
            : { redirect: destination.redirect },
        replace: true,
      });
    }
    return { setupMe: accountProgress.me };
  },
  errorComponent: SetupLoadError,
  component: RootLayout,
});

function RootLayout() {
  return <Outlet />;
}
