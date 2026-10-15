import { MantineProvider } from "@mantine/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { DeclineRemovalControls } from "../../RemovalActionDialogs/DeclineRemovalDialog/DeclineRemovalControls";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
import { RemovalRequestPreview } from "./RemovalRequestPreview";

it.each(["preview", "decline"])(
  "%s navigates internally and keeps a native modifier-click href",
  async (kind) => {
    const request = makeRemovalRequestFromOverrides();
    const href = `/items/${request.itemId}`;
    const actions: RemovalActions = {
      target: request,
      dialog: "decline",
      openDelete: vi.fn(),
      openDecline: vi.fn(),
      close: vi.fn(),
      confirmDelete: vi.fn(),
      confirmDecline: vi.fn(),
      withdraw: vi.fn(),
      isPending: false,
      error: undefined,
      fieldErrors: {},
    };
    const root = createRootRoute();
    const queue = createRoute({
      getParentRoute: () => {
        return root;
      },
      path: "/removal-requests",
      component: () => {
        return kind === "preview" ? (
          <RemovalRequestPreview request={request} />
        ) : (
          <DeclineRemovalControls actions={actions} reason="" href={href} />
        );
      },
    });
    const item = createRoute({
      getParentRoute: () => {
        return root;
      },
      path: "/items/$itemId",
      component: () => {
        return <p>Destination</p>;
      },
    });
    const router = createRouter({
      routeTree: root.addChildren([queue, item]),
      history: createMemoryHistory({
        initialEntries: ["/removal-requests?state=settled"],
      }),
    });
    const view = render(
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>,
    );
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", href);
    const modified = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    link.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    let documentNavigationCount = 0;
    const observe = (event: MouseEvent) => {
      if (!event.defaultPrevented) documentNavigationCount += 1;
    };
    document.addEventListener("click", observe);
    await act(async () => {
      fireEvent.click(link, { button: 0 });
    });
    document.removeEventListener("click", observe);
    expect(documentNavigationCount).toBe(0);
    expect(await screen.findByText("Destination")).toBeVisible();
    await act(async () => {
      router.history.back();
    });
    expect(router.state.location.href).toBe("/removal-requests?state=settled");
    view.unmount();
  },
);
