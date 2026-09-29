import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { createMeResponse } from "@/testing/createMeResponse";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

const PUBLIC_SETTINGS = {
  shoeboxName: "My Shoebox",
  baseUrl: "http://localhost:5173",
};

const ME = createMeResponse({
  displayName: "Abuela",
  storedDisplayName: null,
  email: "abuela@example.com",
  role: "viewer",
});

/** The `201` from `POST /api/auth/session`, as `auth.test.ts` spells it. */
const CREATED_SESSION = {
  ...ME,
  session: {
    sessionId: "018f0000-0000-7000-8000-000000000001",
    deviceLabel: "iPhone, Safari",
    createdAt: "2026-09-28T10:00:00.000Z",
    lastUsedAt: "2026-09-28T10:00:00.000Z",
    expiresAt: "2026-10-28T10:00:00.000Z",
    isCurrent: true,
  },
  isFirstSignIn: true,
};

/** Where the code field is already showing, which is most of these cases. */
const SENT = "/sign-in?email=abuela@example.com&sent=true";

/** The `202` either mint route answers, whoever the address belongs to. */
const CODE_ON_ITS_WAY = {
  body: {
    email: "abuela@example.com",
    expiresAt: "2026-09-28T10:10:00.000Z",
  },
  status: 202,
};

/** The `401` a wrong code gets while two tries remain. */
const WRONG_CODE = {
  body: {
    error: "sign_in_code_invalid",
    message: "That code does not match.",
    details: { attemptsRemaining: 2 },
  },
  status: 401,
};

/** The sentence a wrong code puts under the code field. */
const TWO_TRIES_LEFT =
  "That is not the code in the email. Two tries left before we send you a new one.";

/**
 * Answers each path with whatever the case needs, and records the calls.
 *
 * A map rather than a sequence, because the surface fetches the Shoebox name
 * and posts the form in whatever order React gets round to.
 */
function _respondWith(
  routes: Record<
    string,
    { body: unknown; status: number; waitFor?: Promise<unknown> }
  >,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const answer = routes[path] ?? { body: PUBLIC_SETTINGS, status: 200 };
      // A route may be held open, which is how a case gets to press something
      // twice while the first request is still in flight.
      await answer.waitFor;
      return new Response(
        answer.status === 204 ? null : JSON.stringify(answer.body),
        {
          status: answer.status,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
}

/**
 * The surface, through the real router, at whatever URL the case opens.
 *
 * One `QueryClient` for the router context and the provider both, which is
 * what `main.tsx` does and what two of these cases depend on: the surface
 * writes the account into the cache on a `201` and the guard reads that same
 * entry on the very next navigation.
 *
 * @returns The router, so a case can assert where it ended up.
 */
function _renderAt(path: string) {
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
 * Asks for a code at one address, and returns the body paragraph with that
 * address taken back out of it.
 *
 * The address is the one thing that legitimately differs between a member and
 * a stranger, because it is what the person typed. Everything around it has
 * to be identical, so everything around it is what this returns.
 */
async function _getBodyAfterAsking(address: string): Promise<string> {
  const user = userEvent.setup();
  _renderAt("/sign-in");
  await screen.findByRole("heading", { name: "Sign in to My Shoebox." });
  await user.type(screen.getByLabelText("Your email"), address);
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  const body = await screen.findByText(/is in this Shoebox/);
  const words = body.textContent ?? "";
  cleanup();
  return words.replace(address, "");
}

/** How many requests the surface has actually sent to one path. */
function _countRequestsTo(path: string): number {
  return vi.mocked(fetch).mock.calls.filter((call) => {
    return call[0] === path;
  }).length;
}

/** Gets to a wrong-code refusal, which is where three of these cases start. */
async function _refuseACode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/six digits/i), "410233");
  await user.click(screen.getByRole("button", { name: "Open the photos" }));
  await screen.findByText(TWO_TRIES_LEFT);
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 1", () => {
  it("opens asking for an address, naming the Shoebox", async () => {
    _respondWith({
      "/api/public-settings": { body: PUBLIC_SETTINGS, status: 200 },
    });
    _renderAt("/sign-in");

    expect(
      await screen.findByRole("heading", { name: "Sign in to My Shoebox." }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Email me a code" }),
    ).toBeVisible();
    expect(screen.queryByLabelText(/six digits/i)).not.toBeInTheDocument();
  });

  it("says somebody sent a link, and names nothing else about it", async () => {
    _respondWith({});
    _renderAt("/sign-in?redirect=%2Fitems%2Fabc");

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
    _respondWith({
      "/api/auth/sign-in-codes": {
        body: {
          email: "echoed@example.com",
          expiresAt: "2026-09-28T10:10:00.000Z",
        },
        status: 202,
      },
    });

    const aboutAMember = await _getBodyAfterAsking("abuela@example.com");
    const aboutAStranger = await _getBodyAfterAsking("nobody@example.com");

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
    _respondWith({
      "/api/auth/sign-in-codes": {
        body: {
          error: "invalid_request",
          message: "Invalid request body.",
          details: { fieldErrors: { email: ["Invalid email address"] } },
        },
        status: 400,
      },
    });
    _renderAt("/sign-in");

    await user.type(await screen.findByLabelText("Your email"), "abuela@");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(
      await screen.findByText("That does not look like an email address."),
    ).toBeVisible();
  });

  it("announces a rate limit, which belongs to no field", async () => {
    const user = userEvent.setup();
    _respondWith({
      "/api/auth/sign-in-codes": {
        body: {
          error: "rate_limited",
          message: "Too many requests.",
          details: { retryAfterSeconds: 120 },
        },
        status: 429,
      },
    });
    _renderAt("/sign-in");

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

  it("counts the tries down from the response, not from a constant", async () => {
    const user = userEvent.setup();
    _respondWith({ "/api/auth/session": WRONG_CODE });
    _renderAt(SENT);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    await user.click(screen.getByRole("button", { name: "Open the photos" }));

    expect(await screen.findByText(TWO_TRIES_LEFT)).toBeVisible();
  });

  it("clears the field and promises a new code when the tries run out", async () => {
    const user = userEvent.setup();
    _respondWith({
      "/api/auth/session": {
        body: {
          error: "sign_in_code_attempts_exhausted",
          message: "That code is spent.",
        },
        status: 410,
      },
    });
    _renderAt(SENT);

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
    _respondWith({});
    _renderAt(SENT);

    const field = await screen.findByLabelText(/six digits/i);
    await user.type(field, "410 233");
    expect(field).toHaveValue("410233");

    await user.clear(field);
    await user.type(field, "4102339");
    expect(field).toHaveValue("410233");
  });

  it("goes back where the link was pointing", async () => {
    const user = userEvent.setup();
    _respondWith({
      "/api/auth/session": { body: CREATED_SESSION, status: 201 },
    });
    const router = _renderAt(`${SENT}&redirect=%2Fitems%2Fabc`);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    await user.click(screen.getByRole("button", { name: "Open the photos" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/items/abc");
    });
  });

  it("refuses to be sent anywhere but this origin", async () => {
    const user = userEvent.setup();
    _respondWith({
      "/api/auth/session": { body: CREATED_SESSION, status: 201 },
    });
    const router = _renderAt(`${SENT}&redirect=https%3A%2F%2Fevil.example.com`);

    await user.type(await screen.findByLabelText(/six digits/i), "410233");
    await user.click(screen.getByRole("button", { name: "Open the photos" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("remembers the address across a reload, so a code is not wasted", async () => {
    _respondWith({});
    _renderAt(SENT);

    expect(await screen.findByLabelText("Your email")).toHaveValue(
      "abuela@example.com",
    );
    expect(screen.getByLabelText(/six digits/i)).toBeVisible();
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/auth/sign-in-codes",
      expect.anything(),
    );
  });

  it("gives the resend a real button rather than a link to nowhere", async () => {
    _respondWith({});
    _renderAt(SENT);

    expect(
      await screen.findByRole("button", { name: "Send another" }),
    ).toBeVisible();
  });

  it("sends a new code when somebody asks for another, and says the old one has stopped", async () => {
    const user = userEvent.setup();
    _respondWith({
      "/api/auth/sign-in-codes/resend": CODE_ON_ITS_WAY,
    });
    _renderAt(SENT);

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
    _respondWith({
      "/api/auth/sign-in-codes/resend": {
        ...CODE_ON_ITS_WAY,
        waitFor: inFlight,
      },
    });
    _renderAt(SENT);

    const sendAnother = await screen.findByRole("button", {
      name: "Send another",
    });
    await user.click(sendAnother);
    await user.click(sendAnother);

    expect(_countRequestsTo("/api/auth/sign-in-codes/resend")).toBe(1);
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
    _respondWith({
      "/api/auth/sign-in-codes/resend": {
        ...CODE_ON_ITS_WAY,
        waitFor: inFlight,
      },
    });
    _renderAt(SENT);

    const sendAnother = await screen.findByRole("button", {
      name: "Send another",
    });
    await act(async () => {
      fireEvent.click(sendAnother);
      fireEvent.click(sendAnother);
    });

    expect(_countRequestsTo("/api/auth/sign-in-codes/resend")).toBe(1);
    releaseResend();
  });

  it("forgets the code when the address changes, because a code belongs to an address", async () => {
    const user = userEvent.setup();
    _respondWith({ "/api/auth/session": WRONG_CODE });
    const router = _renderAt(SENT);
    await _refuseACode(user);

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
    _respondWith({ "/api/auth/session": WRONG_CODE });
    _renderAt(SENT);
    await _refuseACode(user);

    await user.type(screen.getByLabelText(/six digits/i), "{backspace}");

    expect(screen.queryByText(TWO_TRIES_LEFT)).not.toBeInTheDocument();
    // Only the code's own refusal goes, and the surface stays where it was:
    // the address is still the one the code was sent to.
    expect(
      screen.getByRole("button", { name: "Open the photos" }),
    ).toBeVisible();
  });
});
