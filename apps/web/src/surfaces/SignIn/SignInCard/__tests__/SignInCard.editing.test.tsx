import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  refuseACode,
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
  it("forgets the code when the address changes, because a code belongs to an address", async () => {
    const user = userEvent.setup();
    respondWith({ "/api/auth/session": WRONG_CODE });
    const router = renderAt(SENT);
    await refuseACode(user);

    await user.type(screen.getByLabelText("Your email"), "x");

    expect(screen.queryByText(TWO_TRIES_LEFT)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/six digits/i)).not.toBeInTheDocument();
    // The button's words change back the moment the address does, which says
    // what pressing it will do rather than leaving it to be discovered from a
    // refusal about a code that was sent to somebody else.
    expect(
      screen.getByRole("button", { name: "Email me a code" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(router.state.location.searchStr).not.toContain("sent");
    });
  });

  it("clears the code's refusal when the code is edited", async () => {
    const user = userEvent.setup();
    respondWith({ "/api/auth/session": WRONG_CODE });
    renderAt(SENT);
    await refuseACode(user);

    await user.type(screen.getByLabelText(/six digits/i), "{backspace}");

    expect(screen.queryByText(TWO_TRIES_LEFT)).not.toBeInTheDocument();
    // Only the code's own refusal goes, and the surface stays where it was:
    // the address is still the one the code was sent to.
    expect(
      screen.getByRole("button", { name: "Open the photos" }),
    ).toBeVisible();
  });
});
