import { installBootstrapRedirectTracking } from "@/api/bootstrap/bootstrapRedirect";
import { requireSignedIn } from "@/session/requireSignedIn/requireSignedIn";
import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import type { MediaLoadingResources } from "@/media/createMediaLoadingResources";
import { Route } from "./__root";
import { Route as AppRoute } from "./_app";

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each(["role", "settings"])(
  "applies a current %s change with one bootstrap and retires previews on role loss",
  async (change) => {
    let account = createMeResponse();
    const authorityRequests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (
          [
            "/api/bootstrap",
            "/api/me",
            "/api/setup",
            "/api/setup/progress",
          ].includes(path)
        )
          authorityRequests.push(path);
        return path === "/api/bootstrap"
          ? Response.json({
              setup: { isRequired: false },
              account,
              progress:
                account.me.role === "admin"
                  ? { needsInvitations: false }
                  : null,
            })
          : new Response(null, { status: 204 });
      }),
    );
    const observed: MediaLoadingResources[] = [];
    function Observer() {
      const resources = useMediaLoading();
      useEffect(() => {
        observed.push(resources);
      }, [resources]);
      return null;
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
    const child = createRoute({
      getParentRoute: () => {
        return shell;
      },
      path: "/",
      component: Observer,
    });
    const router = createRouter({
      routeTree: root.addChildren([shell.addChildren([child])]),
      context: { queryClient: client },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    installBootstrapRedirectTracking({
      router,
      client: router.options.context!.queryClient,
    });
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
    const first = observed.at(-1)!;
    const detail = makeItemDetail();
    first.previews.put([
      {
        itemId: detail.itemId,
        kind: detail.kind,
        width: detail.media.width,
        height: detail.media.height,
        media: detail.media,
      },
    ]);
    authorityRequests.length = 0;
    account =
      change === "role"
        ? createMeResponse({ role: "viewer" })
        : {
            ...account,
            settings: { ...account.settings, timezone: "America/New_York" },
          };
    await act(async () => {
      await router.invalidate();
    });
    expect(authorityRequests).toEqual(["/api/bootstrap"]);
    if (change === "role") {
      expect(first.previews.read(detail.itemId)).toBeUndefined();
      expect(observed.at(-1)).not.toBe(first);
    } else {
      expect(client.getQueryData(["me"])).toMatchObject({
        settings: { timezone: "America/New_York" },
      });
    }
    view.unmount();
    client.clear();
  },
);
