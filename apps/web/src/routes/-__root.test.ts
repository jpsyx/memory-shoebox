import { createMeResponse } from "@/testing/createMeResponse";
import {
  ADMIN,
  createCachedAdminQueryClient,
  getSetupAnswerFromRequest,
  MAIL,
  type SetupAnswer,
} from "@/testing/setupNavigationTestHelpers";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "./__root";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type AnyRouter,
} from "@tanstack/react-router";

function _makeRootRouterFromOptions(
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
  return { router, client };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("root read failure retains the attempted route until a successful retry", async () => {
  let failed = true;
  const { router } = _makeRootRouterFromOptions({
    path: "/items/abc",
    answer: ({ path }) => {
      return path === "/api/setup"
        ? failed
          ? {
              body: { error: "unavailable", message: "Unavailable" },
              status: 503,
            }
          : { body: { isRequired: true } }
        : getSetupAnswerFromRequest({ path });
    },
  });
  await router.load();
  expect(router.state.matches[0]?.error).toMatchObject({ status: 503 });
  expect(router.state.location.pathname).toBe("/items/abc");
  failed = false;
  await router.invalidate();
  expect(router.state.location.pathname).toBe("/setup");
});
it("a cached initialized result is refreshed when the catalog now needs setup", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["setup", "status"], { isRequired: false });
  const { router } = _makeRootRouterFromOptions({
    path: "/people",
    answer: ({ path }) => {
      return path === "/api/setup"
        ? { body: { isRequired: true } }
        : getSetupAnswerFromRequest({ path });
    },
    client: client,
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup");
});
it("non-admin invitation access goes home without reading private setup progress", async () => {
  const { router } = _makeRootRouterFromOptions({
    path: "/setup/invite",
    answer: ({ path }) => {
      return path === "/api/me"
        ? { body: createMeResponse({ role: "viewer" }) }
        : getSetupAnswerFromRequest({ path });
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/");
  expect(
    vi.mocked(fetch).mock.calls.some(([path]) => {
      return path === "/api/setup/progress";
    }),
  ).toBe(false);
});
it("speculative preload makes no setup reads and actual navigation still refreshes status", async () => {
  let isRequired = false;
  let statusReads = 0;
  const { router } = _makeRootRouterFromOptions({
    path: "/people",
    answer: ({ path }) => {
      if (path === "/api/setup") {
        statusReads++;
        return { body: { isRequired } };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/people");
  const readsBefore = statusReads;
  await router.preloadRoute({
    to: "/items/$itemId",
    params: { itemId: "abc" },
  });
  expect(statusReads).toBe(readsBefore);
  isRequired = true;
  await router.navigate({ to: "/items/$itemId", params: { itemId: "abc" } });
  expect(router.state.location.pathname).toBe("/setup");
  expect(statusReads).toBeGreaterThan(readsBefore);
});
it("reconciles a cached admin demoted remotely and discards privileged cached data", async () => {
  const client = createCachedAdminQueryClient();
  client.setQueryData(["mail-health"], MAIL);
  client.setQueryData(["setup", "progress"], { needsInvitations: true });
  const viewer = createMeResponse({
    email: "owner@example.com",
    role: "viewer",
  });
  let progressReads = 0;
  let accountReads = 0;
  const { router } = _makeRootRouterFromOptions({
    path: "/setup/invite",
    answer: ({ path }) => {
      if (path === "/api/setup/progress") {
        progressReads++;
        return {
          body: { error: "setup_forbidden", message: "Admin required." },
          status: 403,
        };
      }
      if (path === "/api/me") {
        accountReads++;
        return { body: viewer };
      }
      return getSetupAnswerFromRequest({ path });
    },
    client: client,
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/");
  expect(client.getQueryData(["me"])).toEqual(viewer);
  expect(client.getQueryData(["members", "admin"])).toBeUndefined();
  expect(client.getQueryData(["mail-health"])).toBeUndefined();
  expect(client.getQueryData(["me", "sessions"])).toBeUndefined();
  expect(client.getQueryData(["setup", "progress"])).toBeUndefined();
  await router.invalidate();
  expect(accountReads).toBe(1);
  expect(progressReads).toBe(1);
});
it("reconciles a cached admin whose session was revoked and resumes ordinary sign-in", async () => {
  const client = createCachedAdminQueryClient();
  client.setQueryData(["timeline"], {
    days: [],
    nextCursor: null,
    resultCount: null,
  });
  let progressReads = 0;
  let accountReads = 0;
  const { router } = _makeRootRouterFromOptions({
    path: "/setup/invite",
    answer: ({ path }) => {
      if (path === "/api/setup/progress") {
        progressReads++;
        return {
          body: { error: "not_signed_in", message: "Session revoked." },
          status: 401,
        };
      }
      if (path === "/api/me") {
        accountReads++;
        return {
          body: { error: "not_signed_in", message: "Session revoked." },
          status: 401,
        };
      }
      return getSetupAnswerFromRequest({ path });
    },
    client: client,
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(router.state.location.search).toEqual({});
  expect(client.getQueryData(["me"])).toBeNull();
  expect(client.getQueryData(["members", "admin"])).toBeUndefined();
  expect(client.getQueryData(["me", "sessions"])).toBeUndefined();
  expect(client.getQueryData(["timeline"])).toBeUndefined();
  await router.invalidate();
  expect(accountReads).toBe(1);
  expect(progressReads).toBe(1);
});
it("a genuine private progress failure preserves the cached account and remains retryable", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["me"], ADMIN);
  let hasFailed = false;
  let accountReads = 0;
  let progressReads = 0;
  const { router } = _makeRootRouterFromOptions({
    path: "/",
    answer: ({ path }) => {
      if (path === "/api/setup/progress") {
        progressReads++;
        if (!hasFailed) {
          hasFailed = true;
          return {
            body: { error: "unavailable", message: "Unavailable." },
            status: 503,
          };
        }
      }
      if (path === "/api/me") {
        accountReads++;
      }
      return getSetupAnswerFromRequest({ path });
    },
    client: client,
  });
  await router.load();
  expect(router.state.matches[0]?.error).toMatchObject({ status: 503 });
  expect(client.getQueryData(["me"])).toEqual(ADMIN);
  await router.invalidate();
  expect(router.state.matches[0]?.status).toBe("success");
  expect(accountReads).toBe(0);
  expect(progressReads).toBe(2);
});
