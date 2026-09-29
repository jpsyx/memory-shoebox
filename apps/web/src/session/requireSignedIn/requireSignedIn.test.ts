import { describe, expect, it } from "vitest";
import {
  makeViewerFromMeResponse,
  requireSignedIn,
} from "@/session/requireSignedIn/requireSignedIn";
import { createMeResponse } from "@/testing/createMeResponse";

const ME = createMeResponse();

describe("makeViewerFromMeResponse", () => {
  it("keeps only what the browser needs to know about who is looking", () => {
    expect(makeViewerFromMeResponse(ME)).toEqual({
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Papá",
      role: "admin",
      isAdmin: true,
    });
  });

  it("does not make a viewer an admin", () => {
    const viewer = makeViewerFromMeResponse(
      createMeResponse({ role: "viewer" }),
    );

    expect(viewer.isAdmin).toBe(false);
  });
});

describe("requireSignedIn", () => {
  it("passes a signed-in member through with the shell's settings", () => {
    const signedIn = requireSignedIn({ me: ME, attemptedHref: "/items/abc" });

    expect(signedIn.viewer.displayName).toBe("Papá");
    expect(signedIn.settings.shoeboxName).toBe("My Shoebox");
  });

  it("redirects to sign in, carrying where they were going", () => {
    let thrown: unknown;
    try {
      requireSignedIn({ me: undefined, attemptedHref: "/items/abc" });
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
      requireSignedIn({ me: undefined, attemptedHref: "/" });
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
