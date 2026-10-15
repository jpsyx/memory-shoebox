import { installBootstrapRedirectTracking } from "@/api/bootstrap/bootstrapRedirect";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import type { MediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { requireSignedIn } from "@/session/requireSignedIn/requireSignedIn";
import { createMeResponse } from "@/testing/createMeResponse";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "./__root";
import { Route as AppRoute } from "./_app";

afterEach(() => {
  return vi.unstubAllGlobals();
});

it("spends one six-thumbnail budget per committed surface, preserving it during preload and pending navigation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      return path === "/api/bootstrap"
        ? Response.json({
            setup: { isRequired: false },
            account: createMeResponse(),
            progress: { needsInvitations: false },
          })
        : new Response(null, { status: 204 });
    }),
  );
  let resources: MediaLoadingResources | undefined;
  function Observer() {
    const current = useMediaLoading();
    useEffect(() => {
      resources = current;
    }, [current]);
    return <div>Photos</div>;
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    beforeLoad: Route.options.beforeLoad,
    component: Route.options.component,
  });
  const shell = createRoute({
    getParentRoute: () => {
      return root;
    },
    id: "_app",
    beforeLoad: ({ context, location }) => {
      return requireSignedIn({
        me: context.setupMe ?? null,
        attemptedHref: location.href,
      });
    },
    component: AppRoute.options.component,
  });
  let release: () => void = () => {};
  let loading = false;
  const waiting = new Promise<void>((done) => {
    release = done;
  });
  const children = [
    createRoute({
      getParentRoute: () => {
        return shell;
      },
      path: "/",
      component: Observer,
    }),
    createRoute({
      getParentRoute: () => {
        return shell;
      },
      path: "/people",
      component: Observer,
    }),
    createRoute({
      getParentRoute: () => {
        return shell;
      },
      path: "/account",
      component: Observer,
      loader: () => {
        loading = true;
        return waiting;
      },
    }),
  ];
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren(children)]),
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  installBootstrapRedirectTracking({ router, client });
  const view = render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    await router.load();
  });
  for (let index = 0; index < 6; index++) {
    expect(resources!.thumbnails.claim(`initial-${index}`)).toBe(true);
  }
  expect(resources!.thumbnails.claim("seventh")).toBe(false);
  await act(async () => {
    await router.preloadRoute({ to: "/people" });
  });
  expect(resources!.thumbnails.claim("preload")).toBe(false);
  let navigation: Promise<void> | undefined;
  act(() => {
    navigation = router.navigate({ to: "/account" });
  });
  await waitFor(() => {
    return expect(loading).toBe(true);
  });
  expect(resources!.thumbnails.claim("pending")).toBe(false);
  await act(async () => {
    release();
    await navigation;
  });
  for (let index = 0; index < 6; index++) {
    expect(resources!.thumbnails.claim(`committed-${index}`)).toBe(true);
  }
  expect(resources!.thumbnails.claim("committed-seventh")).toBe(false);
  view.unmount();
  client.clear();
});
