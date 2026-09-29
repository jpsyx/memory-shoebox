import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBodyAfterAsking,
  PUBLIC_SETTINGS,
  renderAt,
  respondWith,
} from "./SignInCard.fixtures";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 1", () => {
  it("opens asking for an address, naming the Shoebox", async () => {
    respondWith({
      "/api/public-settings": { body: PUBLIC_SETTINGS, status: 200 },
    });
    renderAt("/sign-in");

    expect(
      await screen.findByRole("heading", { name: "Sign in to My Shoebox." }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Email me a code" }),
    ).toBeVisible();
    expect(screen.queryByLabelText(/six digits/i)).not.toBeInTheDocument();
  });

  it("says somebody sent a link, and names nothing else about it", async () => {
    respondWith({});
    renderAt("/sign-in?redirect=%2Fitems%2Fabc");

    expect(
      await screen.findByRole("heading", {
        name: "Somebody sent you a link into My Shoebox.",
      }),
    ).toBeVisible();
    expect(screen.queryByText(/abc/)).not.toBeInTheDocument();
  });

  it("says the same words about a member and about a stranger", async () => {
    // The server answers an identical 202 to both, so the echoed address is
    // deliberately neither of the two submitted: it proves nothing, it is the
    // caller's own input coming back, and the copy must not be reading it.
    respondWith({
      "/api/auth/sign-in-codes": {
        body: {
          email: "echoed@example.com",
          expiresAt: "2026-09-28T10:10:00.000Z",
        },
        status: 202,
      },
    });

    const aboutAMember = await getBodyAfterAsking("abuela@example.com");
    const aboutAStranger = await getBodyAfterAsking("nobody@example.com");

    expect(aboutAMember).toBe(
      "If  is in this Shoebox, a six-digit code is on its way there now. It arrives in about a minute and it works for ten.",
    );
    expect(aboutAStranger).toBe(aboutAMember);
  });

  it("lets the server judge an address, rather than the browser", async () => {
    // Decision 2: nothing validates the address before submission. An
    // `<input type="email">` inside a form is validated by the browser on
    // submit unless the form says otherwise, and a native bubble in the
    // browser's own wording is not this surface's sentence. Worse, it is
    // reached silently: the call never goes out, so the copy written for
    // exactly this refusal can never be shown.
    const user = userEvent.setup();
    respondWith({
      "/api/auth/sign-in-codes": {
        body: {
          error: "invalid_request",
          message: "Invalid request body.",
          details: { fieldErrors: { email: ["Invalid email address"] } },
        },
        status: 400,
      },
    });
    renderAt("/sign-in");

    await user.type(await screen.findByLabelText("Your email"), "abuela@");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(
      await screen.findByText("That does not look like an email address."),
    ).toBeVisible();
  });

  it("announces a rate limit, which belongs to no field", async () => {
    const user = userEvent.setup();
    respondWith({
      "/api/auth/sign-in-codes": {
        body: {
          error: "rate_limited",
          message: "Too many requests.",
          details: { retryAfterSeconds: 120 },
        },
        status: 429,
      },
    });
    renderAt("/sign-in");

    await user.type(
      await screen.findByLabelText("Your email"),
      "abuela@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    // `role="alert"`, because it sits under the button rather than inside a
    // field's `aria-describedby`, and it is the one refusal somebody can do
    // nothing about except read it.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wait 2 minutes, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.",
    );
  });
});
