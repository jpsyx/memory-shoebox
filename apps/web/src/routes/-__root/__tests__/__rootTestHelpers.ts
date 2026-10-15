import { installBootstrapRedirectTracking } from "@/api/bootstrap/bootstrapRedirect";

import { createMeResponse } from "@/testing/createMeResponse";

import { ADMIN, type SetupAnswer } from "@/testing/setupNavigationTestHelpers";

import { QueryClient } from "@tanstack/react-query";

import { afterEach, vi } from "vitest";

import { Route } from "../../__root";

import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type AnyRouter,
} from "@tanstack/react-router";
/** Builds a memory router using the actual root beforeLoad and bootstrap redirect tracking, stubs fetch from supplied answers and returns its query client. */
export function makeRootRouterFromOptions(
  options: Readonly<{
    path: string;
    answer: (
      request: Readonly<{ path: string; init?: Readonly<RequestInit> }>,
    ) => SetupAnswer;
    client?: QueryClient;
  }>,
): { router: AnyRouter; client: QueryClient } {
  const client =
    options.client ??
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const response = options.answer({ path: url, init });
      return Response.json(response.body, { status: response.status ?? 200 });
    }),
  );
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    beforeLoad: Route.options.beforeLoad,
  });
  const routeTree = root.addChildren(
    [
      "/",
      "/people",
      "/items/$itemId",
      "/setup",
      "/setup/invite",
      "/sign-in",
    ].map((path) => {
      return createRoute({
        getParentRoute: () => {
          return root;
        },
        path,
        component: () => {
          return null;
        },
      });
    }),
  );
  const router = createRouter({
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: [options.path] }),
  });
  installBootstrapRedirectTracking({
    router,
    client: router.options.context!.queryClient,
  });
  return { router, client };
}
/** Returns a bootstrap answer for the supplied account, exposing invitation progress only to admins. */
export function bootstrap(
  account: ReturnType<typeof createMeResponse> | null = ADMIN,
  needsInvitations = false,
): SetupAnswer {
  return {
    body: {
      setup: { isRequired: false },
      account,
      progress: account?.me.role === "admin" ? { needsInvitations } : null,
    },
  };
}
/** Restores mocks and stubbed globals after each root-router scenario. */
export function installRootTestLifecycle(): void {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
}
