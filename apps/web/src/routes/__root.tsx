import { useEffect } from "react";
import {
  useRouter,
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { startSettingsSynchronization } from "@/surfaces/Settings/settingsSynchronization/settingsSynchronization";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  bootstrapQueryOptions,
  applyNavigationBootstrap,
  getBootstrapGenerationFromClient,
} from "@/api/bootstrap/bootstrap";
import type { BootstrapResponse } from "@memory-shoebox/shared";
import {
  setupStatusQueryOptions,
  setupProgressQueryOptions,
} from "@/api/setup/setup";
import { meQueryOptions } from "@/api/me/me";
import { getSetupRedirectFromNavigation } from "@/session/getSetupRedirectFromNavigation/getSetupRedirectFromNavigation";
import { SetupLoadError } from "@/surfaces/Setup/SetupLoadError";
import type { QueryClient } from "@tanstack/react-query";

/** Discards private state whenever the current identity or role changes. */
function _seedBootstrap(
  queryClient: QueryClient,
  bootstrap: BootstrapResponse,
): void {
  const previous = queryClient.getQueryData(meQueryOptions.queryKey);
  const account = bootstrap.account;
  if (
    account === null ||
    (previous &&
      (previous.me.member.memberId !== account.me.member.memberId ||
        previous.me.role !== account.me.role))
  ) {
    queryClient.removeQueries({
      predicate: (query) => {
        return query.queryKey[0] !== "bootstrap";
      },
    });
  }
  queryClient.setQueryData(meQueryOptions.queryKey, account);
  queryClient.setQueryData(setupStatusQueryOptions.queryKey, bootstrap.setup);
  if (bootstrap.progress === null) {
    queryClient.removeQueries({ queryKey: setupProgressQueryOptions.queryKey });
  } else {
    queryClient.setQueryData(
      setupProgressQueryOptions.queryKey,
      bootstrap.progress,
    );
  }
}

/** Read failures never turn cached identity into current navigation authority. */
async function _getBootstrap(
  queryClient: QueryClient,
): Promise<BootstrapResponse> {
  const generation = getBootstrapGenerationFromClient(queryClient);
  try {
    const bootstrap = await queryClient.fetchQuery(bootstrapQueryOptions);
    await queryClient.cancelQueries({
      queryKey: meQueryOptions.queryKey,
      exact: true,
    });
    applyNavigationBootstrap({
      queryClient,
      bootstrap,
      generation,
      apply: (response) => {
        return _seedBootstrap(queryClient, response);
      },
    });
    return bootstrap;
  } catch (error) {
    if (error instanceof ApiRequestError && [401, 403].includes(error.status)) {
      queryClient.clear();
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
    const bootstrap = await _getBootstrap(context.queryClient);
    const accountProgress = {
      me: bootstrap.account ?? undefined,
      needsInvitations: bootstrap.progress?.needsInvitations ?? false,
    };
    const destination = getSetupRedirectFromNavigation({
      ...bootstrap.setup,
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
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(
    function synchronizeSettings() {
      return startSettingsSynchronization({
        queryClient,
        invalidateRouter: () => {
          return router.invalidate();
        },
      });
    },
    [queryClient, router],
  );
  return <Outlet />;
}
