import { installBootstrapRedirectTracking } from "@/api/bootstrapHelpers/bootstrapRedirectHelpers";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import type { BootstrapResponse } from "@memory-shoebox/shared";
import { Route } from "./__root";
import type { Mock } from "vitest";
import type { AnyRouter } from "@tanstack/react-router";

type BootstrapRouterFixture = {
  router: AnyRouter;
  client: QueryClient;
  fetcher: Mock<() => Promise<Response>>;
  setDestinationFailure: (failed: boolean) => void;
  setResponse: (current: BootstrapResponse) => void;
};

const FRESH = {
  setup: { isRequired: true },
  account: null,
  progress: null,
} satisfies BootstrapResponse;
const ANONYMOUS = {
  setup: { isRequired: false },
  account: null,
  progress: null,
} satisfies BootstrapResponse;
const INVITATION = {
  setup: { isRequired: false },
  account: createMeResponse(),
  progress: { needsInvitations: true },
} satisfies BootstrapResponse;

function _makeRouterFromResponse({
  initial,
  track = true,
}: {
  initial: BootstrapResponse;
  track?: boolean;
}): BootstrapRouterFixture {
  let failDestination = false;
  const client = new QueryClient();
  let response = initial;
  const fetcher = vi.fn(async () => {
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetcher);
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    beforeLoad: Route.options.beforeLoad,
  });
  const router = createRouter({
    routeTree: root.addChildren(
      ["/", "/people", "/setup", "/setup/invite", "/sign-in"].map((path) => {
        return createRoute({
          getParentRoute: () => {
            return root;
          },
          path,
          beforeLoad: () => {
            if (path === "/setup" && failDestination) {
              throw new Error("Destination failed");
            }
          },
        });
      }),
    ),
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: ["/people?tag=family"] }),
  });
  if (track) {
    installBootstrapRedirectTracking({ router, client });
    installBootstrapRedirectTracking({ router, client });
  }
  return {
    router,
    client,
    fetcher,
    setDestinationFailure: (failed: boolean) => {
      failDestination = failed;
    },
    setResponse: (current: BootstrapResponse) => {
      response = current;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  ["setup", FRESH, "/setup"],
  ["anonymous", ANONYMOUS, "/sign-in"],
  ["invitation", INVITATION, "/setup/invite"],
] as const)(
  "%s redirect chain uses one bootstrap, then independent navigations and retries read fresh",
  async (_kind, response, destination) => {
    const { router, client, fetcher } = _makeRouterFromResponse({
      initial: response,
    });
    await router.load();
    expect(router.state.location.pathname).toBe(destination);
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (destination === "/sign-in") {
      expect(router.state.location.search).toEqual({
        redirect: "/people?tag=family",
      });
    }
    await router.preloadRoute({ to: "/people" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await router.invalidate();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await router.navigate({ to: "/people" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    client.clear();
  },
);

it.each(["retry", "navigation", "unrelated", "preserved-state"])(
  "an independent %s before redirect consumption cannot reuse the source read",
  async (kind) => {
    const { router, client, fetcher, setResponse } = _makeRouterFromResponse({
      initial: FRESH,
    });
    let hasInterleaved = false;
    const stop = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
      if (toLocation.pathname === "/setup" && !hasInterleaved) {
        hasInterleaved = true;
        setResponse(ANONYMOUS);
        if (kind === "retry") {
          void router.invalidate();
        } else {
          void router.navigate({
            to: kind === "unrelated" ? "/people" : "/setup",
            replace: true,
            state: kind === "preserved-state" ? true : undefined,
          });
        }
      }
    });
    await router.load();
    expect(hasInterleaved).toBe(true);
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(fetcher).toHaveBeenCalledTimes(2);
    stop();
    client.clear();
  },
);

it("a write between redirect legs invalidates the receipt", async () => {
  const { router, client, fetcher, setResponse } = _makeRouterFromResponse({
    initial: FRESH,
  });
  let saving: Promise<unknown> | undefined;
  const stop = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
    if (toLocation.pathname === "/setup" && !saving) {
      setResponse(ANONYMOUS);
      saving = client
        .getMutationCache()
        .build(client, {
          scope: { id: "me" },
          mutationFn: async () => {},
        })
        .execute(undefined);
    }
  });
  await router.load();
  await saving;
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(fetcher).toHaveBeenCalledTimes(2);
  stop();
  client.clear();
});

it("consumed redirect tokens and browser Back cannot replay authority", async () => {
  const { router, client, fetcher, setResponse } = _makeRouterFromResponse({
    initial: FRESH,
  });
  await router.load();
  const token = router.state.location.state.bootstrapRedirect;
  expect(typeof token).toBe("string");
  expect(router.state.location.state).not.toHaveProperty("account");
  setResponse(ANONYMOUS);
  await router.navigate({ to: "/sign-in" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  router.history.back();
  await router.load();
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(fetcher).toHaveBeenCalledTimes(3);
  await router.navigate({ to: "/setup", state: { bootstrapRedirect: token } });
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(fetcher).toHaveBeenCalledTimes(4);
  client.clear();
});

it("a failed destination retry reads fresh after consuming the redirect", async () => {
  const { router, client, fetcher, setResponse, setDestinationFailure } =
    _makeRouterFromResponse({ initial: FRESH });
  setDestinationFailure(true);
  await router.load();
  expect(router.state.matches.at(-1)?.status).toBe("error");
  expect(fetcher).toHaveBeenCalledTimes(1);
  setDestinationFailure(false);
  setResponse(ANONYMOUS);
  await router.invalidate();
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(fetcher).toHaveBeenCalledTimes(2);
  client.clear();
});

it("an aborted source read cannot publish authority or a redirect receipt", async () => {
  const { router, client, fetcher, setResponse } = _makeRouterFromResponse({
    initial: FRESH,
  });
  let releaseRead: (response: Response) => void = () => {};
  const deferredRead = new Promise<Response>((settle) => {
    releaseRead = settle;
  });
  fetcher.mockImplementationOnce(() => {
    return deferredRead;
  });
  const abandoned = router.load();
  await vi.waitFor(() => {
    return expect(fetcher).toHaveBeenCalledTimes(1);
  });
  setResponse(ANONYMOUS);
  await router.navigate({ to: "/sign-in" });
  releaseRead(Response.json(FRESH));
  await abandoned;
  expect(router.state.location.pathname).toBe("/sign-in");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(["setup", "status"])).toEqual({
    isRequired: false,
  });
  expect(client.getQueryData(["me"])).toBeNull();
  client.clear();
});

it("a router without navigation tracking never reuses a redirect receipt", async () => {
  const { router, client, fetcher } = _makeRouterFromResponse({
    initial: FRESH,
    track: false,
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/setup");
  expect(fetcher).toHaveBeenCalledTimes(2);
  client.clear();
});

it("an initialized admin leaves setup with one bootstrap for the complete chain", async () => {
  const { router, client, fetcher } = _makeRouterFromResponse({
    initial: {
      ...INVITATION,
      progress: { needsInvitations: false },
    },
  });
  await router.navigate({ to: "/setup" });
  expect(router.state.location.pathname).toBe("/");
  expect(fetcher).toHaveBeenCalledTimes(1);
  client.clear();
});

it("a preload between redirect legs neither reads nor consumes the receipt", async () => {
  const { router, client, fetcher } = _makeRouterFromResponse({
    initial: FRESH,
  });
  let preloading: Promise<unknown> | undefined;
  const stop = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
    if (toLocation.pathname === "/setup" && !preloading) {
      preloading = router.preloadRoute({ to: "/setup" });
    }
  });
  await router.load();
  await preloading;
  expect(router.state.location.pathname).toBe("/setup");
  expect(fetcher).toHaveBeenCalledTimes(1);
  stop();
  client.clear();
});
