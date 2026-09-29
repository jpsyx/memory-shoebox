import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import * as firstSignInModule from "@/session/firstSignIn/firstSignIn";
import {
  setFirstSignIn,
  takeFirstSignIn,
} from "@/session/firstSignIn/firstSignIn";
import { createMeResponse } from "@/testing/createMeResponse";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

const ME = createMeResponse();

/**
 * Somebody signed in, and a Shoebox with a name.
 *
 * Every guarded surface runs the guard, and the guard asks the server who is
 * looking, so a test that navigates to one is a test that makes a request.
 */
function _signedIn(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const body =
        path === "/api/public-settings"
          ? { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" }
          : path === "/api/me/sessions"
            ? { sessions: [], nextCursor: null }
            : path === "/api/health"
              ? { status: "ok", version: "0.0.0", uptimeSeconds: 1 }
              : ME;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

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

/**
 * The timeline, rendered through `<StrictMode>` the way `main.tsx` actually
 * wraps the app.
 *
 * `TimelinePage` reads `takeFirstSignIn()`, which clears the flag as it
 * reads, so it only has one honest answer per mount. `<StrictMode>`
 * double-invokes a render, and a test that never renders through it (as
 * `firstSignIn.test.ts` cannot, being a plain module test) would not catch a
 * regression that made a second, discarded call to `takeFirstSignIn()` win.
 */
async function _renderTimelineInStrictMode() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
        >
          <RouterProvider router={router as never} />
        </MantineProvider>
      </QueryClientProvider>
    </StrictMode>,
  );

  return screen.findByRole("heading", { level: 1 });
}

/** Every surface's own lede, which is how a page says which one it is. */
const SURFACES: ReadonlyArray<readonly [string, string]> = [
  ["/", "The timeline."],
  ["/sign-in", "Sign in to My Shoebox."],
  ["/items/abc", "One item."],
  ["/items/abc/removal", "Ask for this one to come down."],
  ["/people", "Everybody in here."],
  ["/upload", "Put a batch up."],
  // Task 10 changes this lede to "Papá, in My Shoebox.", the member's name.
  ["/account", "Your account."],
  ["/settings", "Shoebox settings."],
  ["/members", "Members."],
  ["/groups", "Groups."],
  ["/milestones", "Milestones."],
  ["/removal-requests", "Removal requests."],
  ["/presence", "Who has been looking."],
  ["/changes", "What has been changed."],
];

beforeEach(() => {
  _signedIn();
});

describe("every surface", () => {
  it.each(SURFACES)("renders its own page at %s", async (path, lede) => {
    const heading = await _renderAt(path);
    // `waitFor` rather than a bare assertion, because sign-in's lede names
    // the Shoebox from `GET /api/public-settings` and renders the fallback
    // word "Shoebox" until that anonymous read lands. That fallback is the
    // design (Decision 3): somebody who cannot see the instance's name can
    // still sign in, and somebody staring at a spinner cannot. The heading
    // is the same element throughout; only its words change.
    await waitFor(() => {
      expect(heading).toHaveTextContent(lede);
    });
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

describe("the first sign-in banner", () => {
  beforeEach(() => {
    // Nobody else in this file sets the flag, but clear it explicitly so
    // this describe's result never depends on test order.
    takeFirstSignIn();
  });

  it("shows the welcome banner when the flag is set", async () => {
    setFirstSignIn(true);

    await _renderTimelineInStrictMode();

    expect(screen.getByText("Welcome in.")).toBeVisible();
  });

  it("shows no banner when the flag was never set", async () => {
    await _renderTimelineInStrictMode();

    expect(screen.queryByText("Welcome in.")).toBeNull();
  });

  // **The two tests above do not cover the StrictMode fix**, which is why
  // neither is named as though it does. Today's React keeps the first of
  // StrictMode's two invocations and throws the second away, so the banner
  // renders correctly even from a component that reads the flag once per
  // invocation, and both pass with the ref guard reverted. This is the one
  // that locks the fix in: it asserts the read happens once, rather than
  // trusting which invocation React happens to keep.
  it("reads the flag exactly once, not once per StrictMode invocation", async () => {
    setFirstSignIn(true);
    const takeSpy = vi.spyOn(firstSignInModule, "takeFirstSignIn");

    await _renderTimelineInStrictMode();

    expect(takeSpy).toHaveBeenCalledTimes(1);
  });
});
