import { useEffect } from "react";
import {
  useRouter,
  createRootRouteWithContext,
  Outlet,
  redirect,
  type ParsedLocation,
  type AnyRouter,
} from "@tanstack/react-router";
import { startSettingsSynchronization } from "@/surfaces/Settings/settingsSynchronization/settingsSynchronization";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  bootstrapQueryOptions,
  cancelNavigationBootstrap,
  applyNavigationBootstrap,
  getBootstrapGenerationFromClient,
} from "@/api/bootstrap/bootstrap";
import type { BootstrapResponse } from "@memory-shoebox/shared";
import {
  setupStatusQueryOptions,
  setupProgressQueryOptions,
} from "@/api/setup/setup";
import { meQueryOptions } from "@/api/me/me";
import { ensureAccountReadProtection } from "@/api/me/ensureAccountReadProtection";
import { getSetupRedirectFromNavigation } from "@/session/getSetupRedirectFromNavigation/getSetupRedirectFromNavigation";
import { SetupLoadError } from "@/surfaces/Setup/SetupLoadError";
import { CancelledError, type QueryClient } from "@tanstack/react-query";
import {
  retainBootstrapForRedirect,
  takeBootstrapForRedirect,
  type NavigationBootstrap,
} from "@/api/bootstrap/bootstrapRedirect";

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
  location: ParsedLocation,
  signal: AbortSignal,
): Promise<NavigationBootstrap> {
  ensureAccountReadProtection(queryClient);
  const generation = getBootstrapGenerationFromClient(queryClient);
  const receipt = takeBootstrapForRedirect({
    client: queryClient,
    location,
    generation,
  });
  const cancelRead = () => {
    cancelNavigationBootstrap(queryClient);
  };
  signal.addEventListener("abort", cancelRead, { once: true });
  try {
    if (signal.aborted) {
      throw new CancelledError();
    }
    const bootstrap =
      receipt?.bootstrap ??
      (await queryClient.fetchQuery(bootstrapQueryOptions));
    await _applyCurrentBootstrap(
      queryClient,
      { bootstrap, generation },
      signal,
    );
    return { bootstrap, generation };
  } catch (error) {
    if (error instanceof ApiRequestError && [401, 403].includes(error.status)) {
      queryClient.clear();
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", cancelRead);
  }
}

async function _applyCurrentBootstrap(
  queryClient: QueryClient,
  navigation: NavigationBootstrap,
  signal: AbortSignal,
): Promise<void> {
  await queryClient.cancelQueries({
    queryKey: meQueryOptions.queryKey,
    exact: true,
  });
  if (signal.aborted) {
    throw new CancelledError();
  }
  applyNavigationBootstrap({
    queryClient,
    ...navigation,
    apply: (response) => {
      _seedBootstrap(queryClient, response);
    },
  });
}

function _redirectForBootstrap(
  options: Readonly<{
    queryClient: QueryClient;
    navigation: NavigationBootstrap;
    location: ParsedLocation;
    buildLocation: AnyRouter["buildLocation"];
  }>,
): void {
  const { queryClient, navigation, location, buildLocation } = options;
  const destination = getSetupRedirectFromNavigation({
    ...navigation.bootstrap.setup,
    me: navigation.bootstrap.account ?? undefined,
    needsInvitations: navigation.bootstrap.progress?.needsInvitations ?? false,
    pathname: location.pathname,
    attemptedUrl: location.href,
  });
  if (destination === undefined) {
    return;
  }
  const target = {
    to: destination.to,
    search:
      destination.redirect === undefined
        ? {}
        : { redirect: destination.redirect },
  };
  throw redirect({
    ...target,
    state: retainBootstrapForRedirect({
      client: queryClient,
      navigation,
      source: location,
      destinationHref: buildLocation(target).href,
    }),
    replace: true,
  });
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
  beforeLoad: async ({
    context,
    location,
    preload,
    abortController,
    buildLocation,
  }) => {
    if (preload) {
      return {
        setupMe:
          context.queryClient.getQueryData(meQueryOptions.queryKey) ??
          undefined,
      };
    }
    const navigation = await _getBootstrap(
      context.queryClient,
      location,
      abortController.signal,
    );
    if (abortController.signal.aborted) {
      throw new CancelledError();
    }
    _redirectForBootstrap({
      queryClient: context.queryClient,
      navigation,
      location,
      buildLocation,
    });
    return { setupMe: navigation.bootstrap.account ?? undefined };
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
