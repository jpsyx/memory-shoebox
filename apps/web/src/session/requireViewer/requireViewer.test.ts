import { describe, expect, it } from "vitest";
import {
  requireViewer,
  type Viewer,
} from "@/session/requireViewer/requireViewer";

const VIEWER: Viewer = {
  memberId: "m1",
  displayName: "Papá",
  role: "admin",
  isAdmin: true,
};

describe("requireViewer", () => {
  it("passes a signed-in viewer straight through", () => {
    expect(
      requireViewer({ viewer: VIEWER, attemptedHref: "/items/abc" }),
    ).toEqual(VIEWER);
  });

  it("redirects to sign in, carrying where they were going", () => {
    let thrown: unknown;
    try {
      requireViewer({ viewer: undefined, attemptedHref: "/items/abc" });
    } catch (error: unknown) {
      thrown = error;
    }

    // `redirect()` in the installed TanStack Router (1.170.x) returns a
    // `Response` carrying the navigation options under `.options`, not a
    // plain object with `to`/`search` at the top level.
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response & { options: unknown }).options).toMatchObject({
      to: "/sign-in",
      search: { redirect: "/items/abc" },
    });
  });

  it("does not carry a redirect back to the pile, which is the default", () => {
    let thrown: unknown;
    try {
      requireViewer({ viewer: undefined, attemptedHref: "/" });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response & { options: unknown }).options).toMatchObject({
      to: "/sign-in",
      search: {},
    });
  });
});
