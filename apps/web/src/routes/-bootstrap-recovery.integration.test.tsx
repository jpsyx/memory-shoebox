import { installBootstrapRedirectTracking } from "@/api/bootstrapHelpers/bootstrapRedirectHelpers";
import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
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
import { Route } from "./__root";

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each(["name", "role", "member", "denied"])(
  "protects a pending %s save across root error unmount and an overlapping retry",
  async (change) => {
    const oldAccount = createMeResponse({ displayName: "Old name" });
    const savedAccount = createMeResponse({
      displayName: "Saved name",
      role: change === "role" ? "viewer" : "admin",
      ...(change === "member"
        ? { memberId: "018f0000-0000-7000-8000-000000000099" }
        : {}),
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["settings", "admin"], {});
    let releaseRead: (response: Response) => void = () => {};
    const deferredRead = new Promise<Response>((settle) => {
      releaseRead = settle;
    });
    const response = (account: typeof oldAccount) => {
      return Response.json({
        setup: { isRequired: false },
        account,
        progress:
          account.me.role === "admin" ? { needsInvitations: false } : null,
      });
    };
    let bootstrapReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path !== "/api/bootstrap") {
          throw new Error(`Unexpected read ${path}`);
        }
        bootstrapReads += 1;
        if (bootstrapReads === 1) {
          return response(oldAccount);
        }
        if (bootstrapReads === 2) {
          return Response.json(
            { error: "unavailable", message: "Unavailable" },
            { status: change === "denied" ? 403 : 503 },
          );
        }
        if (bootstrapReads === 3) {
          return deferredRead;
        }
        return response(savedAccount);
      }),
    );
    const childUnmounted = vi.fn();
    function Destination() {
      useEffect(() => {
        return childUnmounted;
      }, []);
      return <div>Current destination</div>;
    }
    const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
      beforeLoad: Route.options.beforeLoad,
      component: Route.options.component,
      errorComponent: Route.options.errorComponent,
    });
    const child = createRoute({
      getParentRoute: () => {
        return root;
      },
      path: "/",
      component: Destination,
    });
    const router = createRouter({
      routeTree: root.addChildren([child]),
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
    await screen.findByText("Current destination");
    let finishSave: () => void = () => {};
    const pendingSave = new Promise<void>((settle) => {
      finishSave = settle;
    });
    const save = vi.fn(() => {
      return pendingSave;
    });
    const mutation = client.getMutationCache().build(client, {
      scope: { id: "me" },
      mutationFn: save,
      onSuccess: async () => {
        client.setQueryData(["me"], savedAccount);
        await router.invalidate();
      },
    });
    let saving: Promise<void>;
    await act(async () => {
      saving = mutation.execute(undefined);
      await router.invalidate();
    });
    await screen.findByRole("heading", {
      name: "Could not open this Shoebox.",
    });
    expect(childUnmounted).toHaveBeenCalledTimes(1);
    expect(mutation.state.status).toBe("pending");
    let releasePrivate: (value: { private: boolean }) => void = () => {};
    const privateRead = client
      .fetchQuery({
        queryKey: ["groups", "private"],
        queryFn: () => {
          return new Promise<{ private: boolean }>((settle) => {
            releasePrivate = settle;
          });
        },
      })
      .catch(() => {
        return undefined;
      });
    let retrying: Promise<void>;
    await act(async () => {
      retrying = router.invalidate();
      await vi.waitFor(() => {
        return expect(bootstrapReads).toBe(3);
      });
      finishSave();
      await vi.waitFor(() => {
        return expect(client.getQueryData(["me"])).toEqual(savedAccount);
      });
      releaseRead(response(oldAccount));
      await Promise.all([saving!, retrying!]);
    });
    expect(client.getQueryData(["me"])).toEqual(savedAccount);
    releasePrivate({ private: true });
    await privateRead;
    if (change === "role" || change === "member") {
      expect(client.getQueryData(["settings", "admin"])).toBeUndefined();
      expect(client.getQueryData(["groups", "private"])).toBeUndefined();
    }
    expect(save).toHaveBeenCalledTimes(1);
    expect(mutation.state.status).toBe("success");
    expect(router.state.matches[0]?.status).toBe("success");
    view.unmount();
    client.clear();
  },
);
