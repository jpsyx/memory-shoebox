import {
  setupStatusQueryOptions,
  setupProgressQueryOptions,
} from "@/api/setup/setup";
import { meQueryOptions } from "@/api/me/me";
import { getSetupRedirectFromNavigation } from "@/session/getSetupRedirectFromNavigation";
import { SetupLoadError } from "@/surfaces/Setup/SetupLoadError";
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

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
          context.queryClient.getQueryData(meQueryOptions.queryKey) ?? null,
      };
    }
    const status = await context.queryClient.fetchQuery(
      setupStatusQueryOptions,
    );
    const me = status.isRequired
      ? null
      : await context.queryClient.query({
          ...meQueryOptions,
          staleTime: "static",
        });
    const progress =
      me?.me.role === "admin"
        ? await context.queryClient.fetchQuery(setupProgressQueryOptions)
        : { needsInvitations: false };
    const destination = getSetupRedirectFromNavigation({
      ...status,
      me,
      ...progress,
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
    return { setupMe: me };
  },
  errorComponent: SetupLoadError,
  component: RootLayout,
});

function RootLayout() {
  return <Outlet />;
}
