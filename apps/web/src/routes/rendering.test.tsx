import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

/**
 * Every surface, navigated to rather than listed.
 *
 * A test that reads the routes directory proves the files exist, which is
 * not the thing that can go wrong: a route file can exist, type-check, and
 * be named correctly, and still render the wrong page because file-based
 * routing nested it under a parent with no `<Outlet />`. Only opening the
 * URL catches that, so this opens the URL.
 */
async function _renderAt(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <RouterProvider router={router as never} />
      </MantineProvider>
    </QueryClientProvider>,
  );

  return screen.findByRole("heading", { level: 1 });
}

/** Every surface's own lede, which is how a page says which one it is. */
const SURFACES: ReadonlyArray<readonly [string, string]> = [
  ["/", "The timeline."],
  ["/sign-in", "Sign in."],
  ["/items/abc", "One item."],
  ["/items/abc/removal", "Ask for this one to come down."],
  ["/people", "Everybody in here."],
  ["/upload", "Put a batch up."],
  ["/account", "Your account."],
  ["/settings", "Shoebox settings."],
  ["/members", "Members."],
  ["/groups", "Groups."],
  ["/milestones", "Milestones."],
  ["/removal-requests", "Removal requests."],
  ["/presence", "Who has been looking."],
  ["/changes", "What has been changed."],
];

describe("every surface", () => {
  it.each(SURFACES)("renders its own page at %s", async (path, lede) => {
    const heading = await _renderAt(path);
    expect(heading).toHaveTextContent(lede);
  });
});

describe("the top bar", () => {
  it("is the product bar on a surface that does not draw its own", async () => {
    await _renderAt("/people");
    const bars = screen.getAllByRole("banner");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveTextContent("My Shoebox");
  });

  // `DESIGN.md` § Navigation: "Item pages replace the name with a back
  // link." Replace, not stack. Two bars is what this asserts against.
  it("is replaced, not joined, on a page that draws its own", async () => {
    await _renderAt("/items/abc");
    const bars = screen.getAllByRole("banner");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveTextContent("Back to the pile");
    expect(bars[0]).not.toHaveTextContent("My Shoebox");
  });
});
