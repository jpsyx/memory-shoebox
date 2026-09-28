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
import { describe, expect, it } from "vitest";
import { ProductBar } from "@/system/ProductBar";
import { cssVariablesResolver, theme } from "@/theme/theme";

/**
 * A stub route tree with just the four routes the bar links to, rather than
 * the real `routeTree.gen.ts`.
 *
 * The real tree pulls in `_app`'s `beforeLoad` (a query client, the viewer
 * guard) and every surface's own route module for a bar this small: more
 * machinery than a test of "does the right anchor show up" needs. The stub
 * still runs through a real `RouterProvider`, so `Link`'s href resolution
 * and the wrong-route compile check both exercise the genuine code path.
 */
async function _renderProductBar(
  role: "viewer" | "uploader" | "admin",
): Promise<void> {
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
      return (
        <ProductBar shoeboxName="My Shoebox" memberName="Mamá" role={role} />
      );
    },
  });
  const peopleRoute = createRoute({
    getParentRoute: () => {
      return rootRoute;
    },
    path: "/people",
    component: () => {
      return null;
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
  const accountRoute = createRoute({
    getParentRoute: () => {
      return rootRoute;
    },
    path: "/account",
    component: () => {
      return null;
    },
  });
  const routeTree = rootRoute.addChildren([
    indexRoute,
    peopleRoute,
    uploadRoute,
    accountRoute,
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <RouterProvider router={router} />
    </MantineProvider>,
  );

  // The router resolves its first match asynchronously, even against memory
  // history with no loader on any route, so the bar is not there yet on the
  // first tick after `render`.
  await screen.findByRole("link", { name: /People/ });
}

describe("ProductBar", () => {
  it("hides Add from a viewer, who cannot upload", async () => {
    await _renderProductBar("viewer");

    expect(screen.getByRole("link", { name: /Find/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /People/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Mamá/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Add/ })).not.toBeInTheDocument();
  });

  it("shows Add to an uploader", async () => {
    await _renderProductBar("uploader");

    expect(screen.getByRole("link", { name: /Add/ })).toBeVisible();
  });

  it("shows Add to an admin", async () => {
    await _renderProductBar("admin");

    expect(screen.getByRole("link", { name: /Add/ })).toBeVisible();
  });

  it("renders all four controls as real anchors, not buttons", async () => {
    await _renderProductBar("admin");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    const find = screen.getByRole("link", { name: /Find/ });
    const people = screen.getByRole("link", { name: /People/ });
    const add = screen.getByRole("link", { name: /Add/ });
    const account = screen.getByRole("link", { name: /Mamá/ });

    for (const link of [find, people, add, account]) {
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href");
    }

    expect(people).toHaveAttribute("href", "/people");
    expect(add).toHaveAttribute("href", "/upload");
    expect(account).toHaveAttribute("href", "/account");
  });
});
