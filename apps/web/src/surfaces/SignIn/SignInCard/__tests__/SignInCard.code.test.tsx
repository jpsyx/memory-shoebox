import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATED_SESSION,
  renderAt,
  respondWith,
  SENT,
  TWO_TRIES_LEFT,
  WRONG_CODE,
} from "./SignInCard.fixtures";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 1", () => {
  it("counts the tries down from the response, not from a constant", async () => {
    const user = userEvent.setup();
    respondWith({ "/api/auth/session": WRONG_CODE });
    renderAt(SENT);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    await user.click(screen.getByRole("button", { name: "Open the photos" }));

    expect(await screen.findByText(TWO_TRIES_LEFT)).toBeVisible();
  });

  it("clears the field and promises a new code when the tries run out", async () => {
    const user = userEvent.setup();
    respondWith({
      "/api/auth/session": {
        body: {
          error: "sign_in_code_attempts_exhausted",
          message: "That code is spent.",
        },
        status: 410,
      },
    });
    renderAt(SENT);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    await user.click(screen.getByRole("button", { name: "Open the photos" }));

    expect(
      await screen.findByText(
        "That was the last try, so that code has stopped working. A new one is on its way.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText(/six digits/i)).toHaveValue("");
    expect(screen.getByText(/The old one has stopped working/)).toBeVisible();
  });

  it("strips a pasted code of its spaces and anything that is not a digit", async () => {
    const user = userEvent.setup();
    respondWith({});
    renderAt(SENT);

    const field = await screen.findByLabelText(/six digits/i);
    await user.type(field, "410 233");
    expect(field).toHaveValue("410233");

    await user.clear(field);
    await user.type(field, "4102339");
    expect(field).toHaveValue("410233");
  });

  it("goes back where the link was pointing", async () => {
    const user = userEvent.setup();
    respondWith({
      "/api/auth/session": { body: CREATED_SESSION, status: 201 },
    });
    const router = renderAt(`${SENT}&redirect=%2Fitems%2Fabc`);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    await user.click(screen.getByRole("button", { name: "Open the photos" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/items/abc");
    });
  });

  it("refuses to be sent anywhere but this origin", async () => {
    const user = userEvent.setup();
    respondWith({
      "/api/auth/session": { body: CREATED_SESSION, status: 201 },
    });
    const router = renderAt(`${SENT}&redirect=https%3A%2F%2Fevil.example.com`);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    await user.click(screen.getByRole("button", { name: "Open the photos" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("remembers the address across a reload, so a code is not wasted", async () => {
    respondWith({});
    renderAt(SENT);

    expect(await screen.findByLabelText("Your email")).toHaveValue(
      "abuela@example.com",
    );
    expect(screen.getByLabelText(/six digits/i)).toBeVisible();
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/auth/sign-in-codes",
      expect.anything(),
    );
  });
});
