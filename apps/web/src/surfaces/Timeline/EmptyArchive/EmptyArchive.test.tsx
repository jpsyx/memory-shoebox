import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { MemberRole } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { EmptyArchive } from "@/surfaces/Timeline/EmptyArchive/EmptyArchive";
import { theme } from "@/theme/theme";
import classes from "@/system/system.module.css";

/**
 * A stub route tree with just the two routes `EmptyArchive` can link to.
 *
 * `EmptyArchive` renders a real `Link`, which throws outside a mounted
 * router: `ProductBar.test.tsx` carries the identical stub for the identical
 * reason.
 */
function _makeEmptyRouteTree(role: MemberRole) {
  const rootRoute = createRootRoute({
    component: () => {
      return <Outlet />;
    },
  });
  const indexRoute = createRoute({
    getParentRoute: () => {
      return rootRoute;
    },
    path: "/",
    component: () => {
      return <EmptyArchive role={role} />;
    },
  });
  const uploadRoute = createRoute({
    getParentRoute: () => {
      return rootRoute;
    },
    path: "/upload",
    component: () => {
      return null;
    },
  });
  const membersRoute = createRoute({
    getParentRoute: () => {
      return rootRoute;
    },
    path: "/members",
    component: () => {
      return null;
    },
  });
  return rootRoute.addChildren([indexRoute, uploadRoute, membersRoute]);
}

/**
 * Surface 5 at `/`, in that tree.
 *
 * The router resolves its first match asynchronously even against memory
 * history with no loader on any route, so every test below awaits the page's
 * own lede before asserting anything past it.
 */
function _renderEmpty(role: MemberRole): ReturnType<typeof render> {
  const router = createRouter({
    routeTree: _makeEmptyRouteTree(role),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <MantineProvider theme={theme}>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
}

describe("EmptyArchive", () => {
  it("asks an admin to put it all up", async () => {
    _renderEmpty("admin");

    expect(await screen.findByText("Nothing on the door yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Upload media/ })).toBeTruthy();
  });

  it("asks an uploader the same thing, because they can also put things up", async () => {
    _renderEmpty("uploader");

    expect(await screen.findByText("Nothing on the door yet.")).toBeTruthy();
  });

  it("tells a viewer nothing is shared with them, and names nobody", async () => {
    _renderEmpty("viewer");

    expect(await screen.findByText("Nothing here for you yet.")).toBeTruthy();
    expect(screen.queryByText(/Papá/)).toBeNull();
  });

  it("offers a viewer no control, because there is nothing for one to do", async () => {
    _renderEmpty("viewer");

    await screen.findByText("Nothing here for you yet.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers useful guidance without explaining the privacy design", async () => {
    _renderEmpty("viewer");

    expect(
      await screen.findByText(/Ask whoever invited you about it/),
    ).toBeTruthy();
    expect(screen.queryByText(/looks exactly the same/)).toBeNull();
  });

  it("draws the pile's own footprint rather than describing it", async () => {
    const { container } = _renderEmpty("admin");

    await screen.findByText("Nothing on the door yet.");
    // The ghosts themselves, counted. Any `[aria-hidden="true"]` element
    // would have passed here, and one is on the page whatever `Ghosts`
    // renders.
    expect(container.querySelectorAll(`.${classes.ghost}`).length).toBe(6);
  });
});
