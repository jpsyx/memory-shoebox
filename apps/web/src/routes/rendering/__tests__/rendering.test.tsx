import * as firstSignInModule from "@/session/firstSignIn/firstSignIn";
import {
  setFirstSignIn,
  takeFirstSignIn,
} from "@/session/firstSignIn/firstSignIn";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  signInRenderingFixture,
  signOutRenderingFixture,
  renderRouterAt,
  renderRouteHeading,
  renderTimelineInStrictMode,
} from "./renderingFixtureHelpers";
async function _expectAdministrativeSurface(path: string): Promise<void> {
  if (path === "/presence" || path === "/changes") {
    expect(
      await screen.findByText(
        path === "/presence"
          ? "No active or invited members to show."
          : "Nothing has been changed yet.",
      ),
    ).toBeVisible();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Back to my account" }),
    ).toHaveAttribute("href", "/account");
  }
  if (path === "/settings") {
    expect(await screen.findByLabelText("Shoebox name")).toHaveValue(
      "My Shoebox",
    );
    expect(screen.getByLabelText("Sending address")).toHaveValue("");
    expect(screen.getAllByRole("region")).toHaveLength(5);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Back to my account" }),
    ).toHaveAttribute("href", "/account");
  }
  if (path === "/groups") {
    expect(
      await screen.findByRole("button", { name: "New group" }),
    ).toBeEnabled();
  }
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
  ["/members", "Who is in this Shoebox."],
  ["/groups", "Groups."],
  ["/milestones", "Milestones."],
  ["/removal-requests", "Removal requests."],
  ["/presence", "Who has been looking."],
  ["/changes", "What has been changed."],
];

beforeEach(() => {
  signInRenderingFixture();
});

describe("every surface", () => {
  it.each(SURFACES)("renders its own page at %s", async (path, lede) => {
    if (
      path === "/groups" ||
      path === "/settings" ||
      path === "/presence" ||
      path === "/changes"
    ) {
      renderRouterAt(path);
    }
    const heading =
      path === "/groups" ||
      path === "/settings" ||
      path === "/presence" ||
      path === "/changes"
        ? await screen.findByRole("heading", { level: 1 })
        : await renderRouteHeading(path);
    // `waitFor` rather than a bare assertion, because sign-in's lede names
    // the Shoebox from `GET /api/public-settings` and renders the fallback
    // word "Shoebox" until that anonymous read lands. That fallback is the
    // design (Decision 3): somebody who cannot see the instance's name can
    // still sign in, and somebody staring at a spinner cannot. The heading
    // is the same element throughout; only its words change.
    await waitFor(() => {
      expect(heading).toHaveTextContent(lede);
    });
    await _expectAdministrativeSurface(path);
  });
});

describe("the top bar", () => {
  it("is the product bar on a surface that does not draw its own", async () => {
    await renderRouteHeading("/people");
    const bars = screen.getAllByRole("banner");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveTextContent("My Shoebox");
  });

  // `DESIGN.md` § Navigation: "Item pages replace the name with a back
  // link." Replace, not stack. Two bars is what this asserts against.
  it("is replaced, not joined, on a page that draws its own", async () => {
    await renderRouteHeading("/items/abc");
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

    await renderTimelineInStrictMode();

    expect(screen.getByText("Welcome in.")).toBeVisible();
  });

  it("shows no banner when the flag was never set", async () => {
    await renderTimelineInStrictMode();

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

    await renderTimelineInStrictMode();

    expect(takeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("a guarded route reached while signed out", () => {
  beforeEach(() => {
    signOutRenderingFixture();
  });

  // `PRODUCT.md` § Sharing: a URL here is an address rather than a
  // credential, so opening one while signed out leads to sign-in and then
  // back to where it was going. This is the case that caught the guard
  // rejecting instead of redirecting, on `undefined` data.
  it("lands on sign-in carrying where it was going", async () => {
    const router = renderRouterAt("/items/abc");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(router.state.location.search).toEqual({ redirect: "/items/abc" });
  });

  it("carries no redirect back to the pile, which is where sign-in lands", async () => {
    const router = renderRouterAt("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(router.state.location.search).toEqual({});
  });
});

describe("the upload route", () => {
  it("renders only one top bar with its way back to the pile", async () => {
    await renderRouteHeading("/upload");
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByRole("banner")).toHaveTextContent("Back to the pile");
  });
  it("expired authentication retains the addressed batch through sign-in", async () => {
    signOutRenderingFixture();
    const sessionId = "018f0000-0000-7000-8000-00000000c001";
    const router = renderRouterAt(`/upload?session=${sessionId}`);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(router.state.location.search).toEqual({
      redirect: `/upload?session=${sessionId}`,
    });
  });
});
