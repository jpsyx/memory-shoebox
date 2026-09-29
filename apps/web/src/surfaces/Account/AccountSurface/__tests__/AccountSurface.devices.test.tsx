import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countCallsTo,
  DEVICES,
  renderAccount,
  respondWith,
  THAT_LAPTOP,
  THIS_PHONE,
} from "./AccountSurface.fixtures";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 9", () => {
  it("signs this device out through the route that needs no session id", async () => {
    const user = userEvent.setup();
    respondWith();
    const router = renderAccount();

    // The row's button and the modal's confirmation share their words, so
    // the modal is reached through its own dialog rather than by name.
    await user.click(
      await screen.findByRole("button", { name: "Sign out here" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Sign out here" }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(countCallsTo("DELETE", "/api/auth/session")).toBe(1);
    expect(countCallsTo("DELETE", `/api/me/sessions/${THIS_PHONE}`)).toBe(0);
  });

  it("signs another device out by its own id, and stays where it is", async () => {
    const user = userEvent.setup();
    respondWith();
    const router = renderAccount();

    await user.click(
      await screen.findByRole("button", { name: "Sign out MacBook, Chrome" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Sign it out" }),
    );

    await waitFor(() => {
      expect(countCallsTo("DELETE", `/api/me/sessions/${THAT_LAPTOP}`)).toBe(1);
    });
    expect(countCallsTo("DELETE", "/api/auth/session")).toBe(0);
    expect(router.state.location.pathname).toBe("/account");
  });

  it("treats a device that had already gone as news rather than a failure", async () => {
    const user = userEvent.setup();
    respondWith({
      [`DELETE /api/me/sessions/${THAT_LAPTOP}`]: {
        body: { error: "session_not_found", message: "No such session." },
        status: 404,
      },
    });
    renderAccount();

    await user.click(
      await screen.findByRole("button", { name: "Sign out MacBook, Chrome" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Sign it out" }),
    );

    const said = await screen.findByText("That device had already gone.");
    expect(said).toBeVisible();
    // Inside the devices card, where `YouSheet` and `EmailSheet` already put
    // theirs, rather than loose on the page behind it.
    expect(
      screen.getByRole("region", { name: "Your devices" }),
    ).toContainElement(said);
    await waitFor(() => {
      expect(countCallsTo("GET", "/api/me/sessions")).toBe(2);
    });
  });

  // `design-spec.md` is explicit that the prototype designs no loading state
  // and that whoever builds the surface owns it. These two cases are that
  // ownership: the sheet stays on screen and only its middle changes, so a
  // list that has not arrived never looks like an account with no devices.
  it("says the devices are on their way while the list has not arrived", async () => {
    respondWith({
      "GET /api/me/sessions": {
        body: DEVICES,
        status: 200,
        waitFor: new Promise<void>(() => {}),
      },
    });
    renderAccount();

    expect(
      await screen.findByText(
        "The devices you are signed in on are on their way.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Where you are signed in" }),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a way to try again when the list does not arrive at all", async () => {
    const user = userEvent.setup();
    respondWith({
      "GET /api/me/sessions": {
        body: { error: "internal_error", message: "Broke." },
        status: 500,
      },
    });
    renderAccount();

    const said = await screen.findByText(
      "We could not fetch your devices just now.",
    );
    expect(
      screen.getByRole("region", { name: "Your devices" }),
    ).toContainElement(said);
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.queryByText("The devices you are signed in on are on their way."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(countCallsTo("GET", "/api/me/sessions")).toBe(2);
    });
  });
});
