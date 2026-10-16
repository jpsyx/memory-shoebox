import { renderAt as renderSurfaceAt } from "@/testing/surfaceHarnessHelpers";
import type {
  PublicSettingsResponse,
  CreateSessionResponse,
  RequestSignInCodeResponse,
  ApiError,
} from "@memory-shoebox/shared";

import { getBootstrapAnswerFromReader } from "@/testing/getBootstrapAnswerFromReader";

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { createMeResponse } from "@/testing/createMeResponse";

/**
 * The canned answers, the render, and the two walks into the code field,
 * shared by the four `SignInCard` test files beside this one.
 *
 * It is a fixture file rather than anything the surface can reach: nothing
 * outside `__tests__/` imports it, which is what keeps the stubbed `fetch` and
 * the memory router out of the product.
 */

/** The public Shoebox identity displayed before sign-in. */
export const PUBLIC_SETTINGS = {
  shoeboxName: "My Shoebox",
  baseUrl: "http://localhost:5173",
} satisfies PublicSettingsResponse;

/** A signed-in viewer who still needs a stored display name. */
export const ME = createMeResponse({
  displayName: "Abuela",
  storedDisplayName: null,
  email: "abuela@example.com",
  role: "viewer",
});

/** The `201` from `POST /api/auth/session`, as `auth.test.ts` spells it. */
export const CREATED_SESSION = {
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
} satisfies CreateSessionResponse;

/** Where the code field is already showing, which is most of these cases. */
export const SENT = "/sign-in?email=abuela@example.com&sent=true";

/** The `202` either mint route answers, whoever the address belongs to. */
export const CODE_ON_ITS_WAY = {
  body: {
    email: "abuela@example.com",
    expiresAt: "2026-09-28T10:10:00.000Z",
  },
  status: 202,
} satisfies { body: RequestSignInCodeResponse; status: number };

/** The `401` a wrong code gets while two tries remain. */
export const WRONG_CODE = {
  body: {
    error: "sign_in_code_invalid",
    message: "That code does not match.",
    details: { attemptsRemaining: 2 },
  },
  status: 401,
} satisfies { body: ApiError; status: number };

/** The sentence a wrong code puts under the code field. */
export const TWO_TRIES_LEFT =
  "That is not the code in the email. Two tries left before we send you a new one.";

/**
 * Answers each path with whatever the case needs, and records the calls.
 *
 * A map rather than a sequence, because the surface fetches the Shoebox name
 * and posts the form in whatever order React gets round to.
 */
export function respondWith(
  routes: Readonly<
    Record<
      string,
      { body: unknown; status: number; waitFor?: Promise<unknown> }
    >
  >,
): void {
  let signedInAccount: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const read = (requestPath: string) => {
        if (requestPath === "/api/me" && signedInAccount) {
          return { body: signedInAccount, status: 200 };
        }
        return (
          routes[requestPath] ?? {
            body:
              requestPath === "/api/setup"
                ? { isRequired: false }
                : requestPath === "/api/setup/progress"
                  ? { needsInvitations: false }
                  : requestPath === "/api/me"
                    ? { error: "not_signed_in", message: "No live session." }
                    : PUBLIC_SETTINGS,
            status: requestPath === "/api/me" ? 401 : 200,
          }
        );
      };
      const answer =
        path === "/api/bootstrap"
          ? await getBootstrapAnswerFromReader(read)
          : read(path);
      if (path === "/api/auth/session" && answer.status === 201) {
        signedInAccount = answer.body;
      }
      // A route may be held open, which is how a case gets to press something
      // twice while the first request is still in flight.
      await (answer as { waitFor?: Promise<unknown> }).waitFor;
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
export function renderAt(
  path: string,
): ReturnType<typeof renderSurfaceAt>["router"] {
  return renderSurfaceAt(path).router;
}

/**
 * Asks for a code at one address, and returns the body paragraph with that
 * address taken back out of it.
 *
 * The address is the one thing that legitimately differs between a member and
 * a stranger, because it is what the person typed. Everything around it has
 * to be identical, so everything around it is what this returns.
 */
export async function getBodyAfterAsking(address: string): Promise<string> {
  const user = userEvent.setup();
  renderAt("/sign-in");
  await screen.findByRole("heading", { name: "Sign in to My Shoebox." });
  await user.type(screen.getByLabelText("Your email"), address);
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  const body = await screen.findByText(/is in this Shoebox/);
  const words = body.textContent ?? "";
  cleanup();
  return words.replace(address, "");
}

/** How many requests the surface has actually sent to one path. */
export function countRequestsTo(path: string): number {
  return vi.mocked(fetch).mock.calls.filter((call) => {
    return call[0] === path;
  }).length;
}

/** Gets to a wrong-code refusal, which is where three of these cases start. */
export async function refuseACode(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(await screen.findByLabelText(/six digits/i), "410233");
  await user.click(screen.getByRole("button", { name: "Open the photos" }));
  await screen.findByText(TWO_TRIES_LEFT);
}
