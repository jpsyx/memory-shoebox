import { routeTree } from "@/routeTree.gen";
import * as firstSignInModule from "@/session/firstSignIn/firstSignIn";
import {
  setFirstSignIn,
  takeFirstSignIn,
} from "@/session/firstSignIn/firstSignIn";
import { createMeResponse } from "@/testing/createMeResponse";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";
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

const ME = createMeResponse();

/**
 * A blank archive, and the two vocabularies a blank filter surface reads.
 *
 * The timeline route now reads these five paths on every mount, so this
 * generic smoke test has to answer them too, or its query errors out and the
 * surface never settles on either of its headings.
 */
const EMPTY_TIMELINE_ANSWERS: Record<string, unknown> = {
  "/api/timeline": { days: [], nextCursor: null, resultCount: null },
  "/api/timeline/rail": { days: [], nextCursor: null },
  "/api/filters/facets": { tags: [], people: [], resultCount: 0 },
  "/api/tags": { tags: [], nextCursor: null },
  "/api/people": { people: [], nextCursor: null, peopleCount: 0 },
  "/api/milestones": { milestones: [], nextCursor: null },
  "/api/removal-requests?state=open": {
    removalRequests: [],
    nextCursor: null,
    openCount: 0,
    settledCount: 0,
  },
  "/api/removal-requests?state=settled": {
    removalRequests: [],
    nextCursor: null,
    openCount: 0,
    settledCount: 0,
  },
};

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
      if (path === "/api/upload-sessions/current") {
        return new Response(null, { status: 204 });
      }
      const body =
        path === "/api/public-settings"
          ? { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" }
          : path === "/api/me/sessions"
            ? { sessions: [], nextCursor: null }
            : path === "/api/health"
              ? { status: "ok", version: "0.0.0", uptimeSeconds: 1 }
              : (EMPTY_TIMELINE_ANSWERS[path] ?? ME);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/**
 * Nobody signed in: `GET /api/me` answers the one refusal that is an answer.
 *
 * **The path three test files managed not to exercise.** `me.test.ts` calls
 * `meQueryOptions.queryFn` directly, which never reaches the query client;
 * `requireSignedIn.test.ts` hands the guard a signed-out value by hand; and
 * `_signedIn` above stubs a member, so every other case here is signed in.
 * What none of them ran is the whole thing: a real query client fetching a
 * real `401` and a route deciding what to do about it.
 */
function _signedOut(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const isAccount = path === "/api/me";
      return new Response(
        JSON.stringify(
          isAccount
            ? { error: "not_signed_in", message: "No live session." }
            : { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" },
        ),
        {
          status: isAccount ? 401 : 200,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
}

/**
 * The router alone, without waiting for a heading.
 *
 * A redirected navigation never renders the surface that was asked for, so a
 * case about a redirect cannot wait on that surface's lede the way
 * `_renderAt` does.
 *
 * @returns The router, so a case can assert where it ended up.
 */
function _renderRouterAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <RouterProvider router={router as never} />
      </MantineProvider>
    </QueryClientProvider>,
  );

  return router;
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
  ["/", "Nothing on the door yet."],
  ["/sign-in", "Sign in to My Shoebox."],
  ["/items/abc", "This one is not here."],
  ["/items/abc/removal", "This one is not here."],
  ["/people", "Everybody in the archive."],
  ["/upload", "Put it all up."],
  ["/account", "Papá, in My Shoebox."],
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

describe("a guarded route reached while signed out", () => {
  beforeEach(() => {
    _signedOut();
  });

  // `PRODUCT.md` § Sharing: a URL here is an address rather than a
  // credential, so opening one while signed out leads to sign-in and then
  // back to where it was going. This is the case that caught the guard
  // rejecting instead of redirecting, on `undefined` data.
  it("lands on sign-in carrying where it was going", async () => {
    const router = _renderRouterAt("/items/abc");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(router.state.location.search).toEqual({ redirect: "/items/abc" });
  });

  it("carries no redirect back to the pile, which is where sign-in lands", async () => {
    const router = _renderRouterAt("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(router.state.location.search).toEqual({});
  });
});

describe("the upload route", () => {
  it("renders only one top bar with its way back to the pile", async () => {
    await _renderAt("/upload");
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByRole("banner")).toHaveTextContent("Back to the pile");
  });
  it("expired authentication retains the addressed batch through sign-in", async () => {
    _signedOut();
    const sessionId = "018f0000-0000-7000-8000-00000000c001";
    const router = _renderRouterAt(`/upload?session=${sessionId}`);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(router.state.location.search).toEqual({
      redirect: `/upload?session=${sessionId}`,
    });
  });
});
