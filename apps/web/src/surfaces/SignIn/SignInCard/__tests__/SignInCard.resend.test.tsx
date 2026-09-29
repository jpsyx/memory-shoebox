import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODE_ON_ITS_WAY,
  countRequestsTo,
  renderAt,
  respondWith,
  SENT,
  WRONG_CODE,
} from "./SignInCard.fixtures";

/**
 * Asking for another code, and the three cases that each press a button
 * twice.
 *
 * The last of those presses the redeem button rather than the resend one, and
 * it is here rather than beside the other code cases because the three read as
 * one argument: each comment says what the case before it could not catch, and
 * splitting them would leave two of them referring to something in another
 * file.
 */

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 1", () => {
  it("gives the resend a real button rather than a link to nowhere", async () => {
    respondWith({});
    renderAt(SENT);

    expect(
      await screen.findByRole("button", { name: "Send another" }),
    ).toBeVisible();
  });

  it("sends a new code when somebody asks for another, and says the old one has stopped", async () => {
    const user = userEvent.setup();
    respondWith({
      "/api/auth/sign-in-codes/resend": CODE_ON_ITS_WAY,
    });
    renderAt(SENT);

    await user.click(
      await screen.findByRole("button", { name: "Send another" }),
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-in-codes/resend",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      await screen.findByText(/The old one has stopped working/),
    ).toHaveTextContent(
      "If abuela@example.com is in this Shoebox, a new code is on its way there now. The old one has stopped working. It usually arrives in about a minute.",
    );
  });

  it("sends one code when the resend is pressed twice, not two", async () => {
    // Every mint supersedes the address's live code. A second request stops
    // the code in the first email from working, so somebody who pressed twice
    // is left holding a message whose digits are silently dead, having done
    // nothing wrong. It also spends two of the five mints an address gets in
    // an hour.
    const user = userEvent.setup();
    let releaseResend = (): void => {};
    const inFlight = new Promise<void>((resolve) => {
      releaseResend = resolve;
    });
    respondWith({
      "/api/auth/sign-in-codes/resend": {
        ...CODE_ON_ITS_WAY,
        waitFor: inFlight,
      },
    });
    renderAt(SENT);

    const sendAnother = await screen.findByRole("button", {
      name: "Send another",
    });
    await user.click(sendAnother);
    await user.click(sendAnother);

    expect(countRequestsTo("/api/auth/sign-in-codes/resend")).toBe(1);
    expect(sendAnother).toBeDisabled();
    releaseResend();
  });

  it("sends one code even when both presses land before anything re-renders", async () => {
    // The case above is stopped by the control going disabled, which needs a
    // render between the two presses. This one gives it none: both events are
    // dispatched inside a single batch, so the button is still enabled for
    // the second and only the guard inside the flow can refuse it. A snapshot
    // of `isPending` cannot: it was read in the render both handlers were
    // bound in, and in that render nothing was pending.
    let releaseResend = (): void => {};
    const inFlight = new Promise<void>((resolve) => {
      releaseResend = resolve;
    });
    respondWith({
      "/api/auth/sign-in-codes/resend": {
        ...CODE_ON_ITS_WAY,
        waitFor: inFlight,
      },
    });
    renderAt(SENT);

    const sendAnother = await screen.findByRole("button", {
      name: "Send another",
    });
    await act(async () => {
      fireEvent.click(sendAnother);
      fireEvent.click(sendAnother);
    });

    expect(countRequestsTo("/api/auth/sign-in-codes/resend")).toBe(1);
    releaseResend();
  });

  it("redeems once when the code is submitted twice before anything re-renders", async () => {
    // A code gets three tries before the server invalidates it and sends a
    // replacement, so a double tap spends a third of them and brings the
    // email in front of somebody a third of the way to being dead. Mantine's
    // disabled attribute cannot stop this one either: it is read from the
    // render both presses were bound in.
    const user = userEvent.setup();
    let releaseSession = (): void => {};
    const inFlight = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });
    respondWith({
      "/api/auth/session": { ...WRONG_CODE, waitFor: inFlight },
    });
    renderAt(SENT);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    const openThePhotos = screen.getByRole("button", {
      name: "Open the photos",
    });
    await act(async () => {
      fireEvent.click(openThePhotos);
      fireEvent.click(openThePhotos);
    });

    expect(countRequestsTo("/api/auth/session")).toBe(1);
    releaseSession();
  });
});
