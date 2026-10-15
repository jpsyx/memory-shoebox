import { meQueryOptions } from "@/api/me/me";
import { installBootstrapRedirectTracking } from "@/api/bootstrap/bootstrapRedirect";
import { startSettingsSynchronization } from "@/surfaces/Settings/settingsSynchronization/settingsSynchronization";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  ADMIN,
  createCachedAdminQueryClient,
  MAIL,
  type SetupAnswer,
} from "@/testing/setupNavigationTestHelpers";
import { CancelledError, QueryClient } from "@tanstack/react-query";
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
  installBootstrapRedirectTracking({
    router,
    client: router.options.context!.queryClient,
  });
  return { router, client };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function _bootstrap(
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

it("actual navigation needs one authority request and preload needs no bootstrap", async () => {
  const requestPaths: string[] = [];
  const { router, client } = _makeRootRouterFromOptions({
    path: "/people",
    answer: ({ path }) => {
      requestPaths.push(path);
      return _bootstrap();
    },
  });
  await router.load();
  expect(requestPaths).toEqual(["/api/bootstrap"]);
  expect(client.getQueryData(["me"])).toEqual(ADMIN);
  expect(client.getQueryData(["setup", "progress"])).toEqual({
    needsInvitations: false,
  });
  requestPaths.length = 0;
  await router.preloadRoute({
    to: "/items/$itemId",
    params: { itemId: "abc" },
  });
  expect(requestPaths).toEqual([]);
  await router.navigate({ to: "/items/$itemId", params: { itemId: "abc" } });
  expect(requestPaths).toEqual(["/api/bootstrap"]);
});

it("root read failure retains the attempted route until a successful retry", async () => {
  let failed = true;
  const { router } = _makeRootRouterFromOptions({
    path: "/items/abc",
    answer: () => {
      return failed
        ? {
            body: { error: "unavailable", message: "Unavailable" },
            status: 503,
          }
        : {
            body: {
              setup: { isRequired: true },
              account: null,
              progress: null,
            },
          };
    },
  });
  await router.load();
  expect(router.state.matches[0]?.error).toMatchObject({ status: 503 });
  expect(router.state.location.pathname).toBe("/items/abc");
  failed = false;
  await router.invalidate();
  expect(router.state.location.pathname).toBe("/setup");
});

it("fresh setup replaces cached initialized status and private data", async () => {
  const client = createCachedAdminQueryClient();
  client.setQueryData(["setup", "status"], { isRequired: false });
  const { router } = _makeRootRouterFromOptions({
    path: "/people",
    client,
    answer: () => {
      return {
        body: { setup: { isRequired: true }, account: null, progress: null },
      };
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup");
  expect(client.getQueryData(["members", "admin"])).toBeUndefined();
});

it("initialized anonymous entry preserves its intended destination", async () => {
  const { router } = _makeRootRouterFromOptions({
    path: "/items/abc?tag=family",
    answer: () => {
      return _bootstrap(null);
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(router.state.location.search).toEqual({
    redirect: "/items/abc?tag=family",
  });
});

it.each(["demotion", "revocation"])(
  "%s discards stale private authority without secondary reads",
  async (change) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData(["mail-health"], MAIL);
    client.setQueryData(["timeline"], { private: true });
    client.setQueryData(["setup", "progress"], { needsInvitations: true });
    const account =
      change === "demotion" ? createMeResponse({ role: "viewer" }) : null;
    const requestPaths: string[] = [];
    const { router } = _makeRootRouterFromOptions({
      path: "/setup/invite",
      client,
      answer: ({ path }) => {
        requestPaths.push(path);
        return _bootstrap(account);
      },
    });
    await router.load();
    expect(router.state.location.pathname).toBe(
      change === "demotion" ? "/" : "/sign-in",
    );
    expect(client.getQueryData(["me"])).toEqual(account);
    for (const key of [
      ["members", "admin"],
      ["mail-health"],
      ["me", "sessions"],
      ["timeline"],
      ["setup", "progress"],
    ]) {
      expect(client.getQueryData(key)).toBeUndefined();
    }
    expect(
      requestPaths.every((path) => {
        return path === "/api/bootstrap";
      }),
    ).toBe(true);
  },
);

it("pending invitation setup and completion races use the new bootstrap each navigation", async () => {
  let needsInvitations = true;
  const { router } = _makeRootRouterFromOptions({
    path: "/people",
    answer: () => {
      return _bootstrap(ADMIN, needsInvitations);
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup/invite");
  needsInvitations = false;
  await router.navigate({ to: "/people" });
  expect(router.state.location.pathname).toBe("/people");
});

it.each(["settings-recovery", "group-continuation"])(
  "%s survives transient read failure without granting cached authority",
  async (key) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData([key], {
      hasCommitted: true,
      message: "Saved",
      isRefreshing: false,
    });
    const { router } = _makeRootRouterFromOptions({
      path: "/people",
      client,
      answer: () => {
        return {
          body: { error: "unavailable", message: "Unavailable" },
          status: 503,
        };
      },
    });
    await router.load();
    expect(router.state.matches[0]?.status).toBe("error");
    expect(client.getQueryData([key])).toMatchObject({ hasCommitted: true });
  },
);

it("late private reads cannot restore retired data after current authority loss", async () => {
  const client = createCachedAdminQueryClient();
  let finishRead: (value: { private: boolean }) => void = () => {};
  const pending = new Promise<{ private: boolean }>((settle) => {
    finishRead = settle;
  });
  const read = client
    .fetchQuery({
      queryKey: ["items", "private"],
      queryFn: () => {
        return pending;
      },
    })
    .catch(() => {
      return undefined;
    });
  const { router } = _makeRootRouterFromOptions({
    path: "/sign-in",
    client,
    answer: () => {
      return _bootstrap(null);
    },
  });
  await router.load();
  finishRead({ private: true });
  await read;
  expect(client.getQueryData(["items", "private"])).toBeUndefined();
  expect(client.getQueryData(["me"])).toBeNull();
});

it.each(["before", "during", "reconciliation", "publication"])(
  "cancels a navigation read started %s a serialized write before stale publication",
  async (timing) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData(["settings", "admin"], {});
    const { router } = _makeRootRouterFromOptions({
      path: "/people",
      client,
      answer: () => {
        return _bootstrap();
      },
    });
    const stop = startSettingsSynchronization({
      queryClient: client,
      invalidateRouter: async () => {},
    });
    let releaseRead: (response: Response) => void = () => {};
    const deferredRead = new Promise<Response>((settle) => {
      releaseRead = settle;
    });
    let readCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        return ++readCount === 1
          ? deferredRead
          : Promise.resolve(Response.json(_bootstrap(saved).body));
      }),
    );
    let finishSave: () => void = () => {};
    const pendingSave = new Promise<void>((settle) => {
      finishSave = settle;
    });
    const saved = createMeResponse({ displayName: "Saved name" });
    const save = vi.fn(() => {
      return pendingSave;
    });
    const mutation = client.getMutationCache().build(client, {
      scope: { id: "me" },
      mutationFn: save,
      onSuccess: async () => {
        client.setQueryData(["me"], saved);
        if (timing === "reconciliation") await router.invalidate();
      },
    });
    const saving =
      timing !== "before" ? mutation.execute(undefined) : undefined;
    const loading = router.load();
    await vi.waitFor(() => {
      return expect(fetch).toHaveBeenCalled();
    });
    const laterSave =
      timing === "before" ? mutation.execute(undefined) : undefined;
    if (timing === "publication") {
      const stopPublication = client.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.action.type === "success" &&
          event.query.queryKey[0] === "bootstrap"
        )
          finishSave();
      });
      releaseRead(Response.json(_bootstrap().body));
      await saving;
      stopPublication();
    } else {
      finishSave();
      await (saving ?? laterSave);
      releaseRead(Response.json(_bootstrap().body));
    }
    await loading;
    expect(client.getQueryData(["me"])).toEqual(saved);
    expect(router.state.matches[0]?.status).toBe(
      timing === "reconciliation" ? "success" : "error",
    );
    if (timing !== "reconciliation") {
      expect(router.state.matches[0]?.error).toBeInstanceOf(CancelledError);
      await router.invalidate();
      expect(router.state.matches[0]?.status).toBe("success");
      expect(client.getQueryData(["me"])).toEqual(saved);
    }
    expect(save).toHaveBeenCalledTimes(1);
    stop();
    client.clear();
  },
);

it("a setup redirect chain performs one fresh bootstrap for the actual navigation", async () => {
  const paths: string[] = [];
  const { router } = _makeRootRouterFromOptions({
    path: "/people",
    answer: ({ path }) => {
      paths.push(path);
      return {
        body: { setup: { isRequired: true }, account: null, progress: null },
      };
    },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup");
  expect(paths).toEqual(["/api/bootstrap"]);
});

it.each([401, 403])(
  "authority refusal %s discards committed recovery and cached private data",
  async (status) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData(["settings-recovery"], { hasCommitted: true });
    client.setQueryData(["group-continuation"], { hasCommitted: true });
    const { router } = _makeRootRouterFromOptions({
      path: "/people",
      client,
      answer: () => {
        return { status, body: { error: "not_allowed", message: "Refused" } };
      },
    });
    await router.load();
    expect(router.state.matches[0]?.status).toBe("error");
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(client.getQueryData(["settings-recovery"])).toBeUndefined();
    expect(client.getQueryData(["group-continuation"])).toBeUndefined();
  },
);

it("account replacement discards the prior member's private data", async () => {
  const client = createCachedAdminQueryClient();
  const replacement = createMeResponse({
    memberId: "018f0000-0000-7000-8000-000000000099",
  });
  const { router } = _makeRootRouterFromOptions({
    path: "/people",
    client,
    answer: () => {
      return _bootstrap(replacement);
    },
  });
  await router.load();
  expect(client.getQueryData(["me"])).toEqual(replacement);
  expect(client.getQueryData(["members", "admin"])).toBeUndefined();
  expect(client.getQueryData(["me", "sessions"])).toBeUndefined();
});

it("an unchanged account poll fences an overlapping bootstrap and leaves a fresh explicit retry", async () => {
  const client = createCachedAdminQueryClient();
  const { router } = _makeRootRouterFromOptions({
    path: "/people",
    client,
    answer: () => {
      return _bootstrap();
    },
  });
  let releaseRead: (response: Response) => void = () => {};
  const staleRead = new Promise<Response>((settle) => {
    releaseRead = settle;
  });
  const paths: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input) => {
    const path = String(input);
    paths.push(path);
    if (path === "/api/me") {
      return Response.json(ADMIN);
    }
    return paths.length === 1 ? staleRead : Response.json(_bootstrap().body);
  });
  const loading = router.load();
  await vi.waitFor(() => {
    expect(paths).toEqual(["/api/bootstrap"]);
  });
  await client.fetchQuery({ ...meQueryOptions, staleTime: 0 });
  releaseRead(Response.json(_bootstrap().body));
  await loading;
  expect(client.getQueryData(["me"])).toEqual(ADMIN);
  expect(router.state.matches[0]?.error).toBeInstanceOf(CancelledError);
  await router.invalidate();
  expect(router.state.matches[0]?.status).toBe("success");
  expect(paths).toEqual(["/api/bootstrap", "/api/me", "/api/bootstrap"]);
  client.clear();
});
