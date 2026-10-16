import { installBootstrapRedirectTracking } from "@/api/bootstrapHelpers/bootstrapRedirectHelpers";
import { hasPendingAccountWrite } from "@/api/me/accountReadProtectionHelpers/accountReadProtectionHelpers";
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
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BootstrapDestination } from "../testing/BootstrapDestination";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "./__root";

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  { field: "name", denial: 401 },
  { field: "name", denial: 403 },
  { field: "notify", denial: 401 },
  { field: "notify", denial: 403 },
])(
  "preserves a pending $field publication through root $denial and an overlapping retry",
  async ({ field, denial }) => {
    const oldAccount = createMeResponse({
      displayName: "Old name",
      role: "viewer",
    });
    const savedAccount =
      field === "name"
        ? createMeResponse({ displayName: "Saved name", role: "viewer" })
        : {
            ...oldAccount,
            me: {
              ...oldAccount.me,
              notify: { ...oldAccount.me.notify, onUpload: false },
            },
          };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const pendingSave = Promise.withResolvers<typeof savedAccount>();
    let releaseRetry: (response: Response) => void = () => {};
    const pendingRetry = new Promise<Response>((settle) => {
      releaseRetry = settle;
    });
    const bootstrap = (account: typeof oldAccount) => {
      return Response.json({
        setup: { isRequired: false },
        account,
        progress: null,
      });
    };
    let reads = 0;
    const save = vi.fn(() => {
      return pendingSave.promise;
    });
    const mutation = client.getMutationCache().build(client, {
      scope: { id: "me" },
      mutationFn: save,
      onSuccess: (account) => {
        client.setQueryData(["me"], account);
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path !== "/api/bootstrap") {
          throw new Error(`Unexpected read ${path}`);
        }
        reads += 1;
        if (reads === 1) {
          return bootstrap(oldAccount);
        }
        if (reads === 2) {
          return Response.json(
            { error: "forbidden", message: "Refused" },
            { status: denial },
          );
        }
        if (reads === 3) {
          return pendingRetry;
        }
        return bootstrap(savedAccount);
      }),
    );
    const childUnmounted = vi.fn();
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
      component: () => {
        return <BootstrapDestination onUnmount={childUnmounted} />;
      },
    });
    const router = createRouter({
      routeTree: root.addChildren([child]),
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
    await screen.findByText("Current destination");
    client.setQueryData(["settings", "admin"], { private: true });
    let releasePrivate: (value: string) => void = () => {};
    const privateRead = client
      .fetchQuery({
        queryKey: ["groups", "private"],
        queryFn: () => {
          return new Promise<string>((settle) => {
            releasePrivate = settle;
          });
        },
      })
      .catch(() => {
        return undefined;
      });
    let saving: Promise<typeof savedAccount>;
    await act(async () => {
      saving = mutation.execute(undefined);
      await vi.waitFor(() => {
        expect(save).toHaveBeenCalledTimes(1);
      });
    });
    await act(async () => {
      await router.invalidate();
    });
    await screen.findByRole("heading", {
      name: "Could not open this Shoebox.",
    });
    expect(childUnmounted).toHaveBeenCalledTimes(1);
    expect(mutation.state.status).toBe("pending");
    expect(client.isMutating()).toBe(0);
    expect(hasPendingAccountWrite(client)).toBe(false);
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(client.getQueryData(["settings", "admin"])).toBeUndefined();
    releasePrivate("old private data");
    await privateRead;
    expect(client.getQueryData(["groups", "private"])).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => {
      expect(reads).toBe(3);
    });
    await act(async () => {
      pendingSave.resolve(savedAccount);
      await saving!;
      await vi.waitFor(() => {
        expect(mutation.state.status).toBe("success");
      });
    });
    expect(client.getQueryData(["me"])).toEqual(savedAccount);
    await act(async () => {
      releaseRetry(bootstrap(oldAccount));
      await vi.waitFor(() => {
        expect(router.state.isLoading).toBe(false);
      });
    });
    expect(client.getQueryData(["me"])).toEqual(savedAccount);
    expect(hasPendingAccountWrite(client)).toBe(false);
    expect(reads).toBe(3);
    expect(screen.queryByText("Current destination")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Current destination");
    expect(reads).toBe(4);
    expect(client.getQueryData(["me"])).toEqual(savedAccount);
    expect(client.getQueryData(["groups", "private"])).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
    view.unmount();
    client.clear();
  },
);
