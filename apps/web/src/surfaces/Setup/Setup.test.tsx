import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { createMeResponse } from "@/testing/createMeResponse";
import { CREATED_SESSION } from "@/surfaces/SignIn/SignInCard/__tests__/SignInCard.fixtures";
import {
  mailHealthResponseSchema,
  adminMemberDtoSchema,
} from "@memory-shoebox/shared";
import { theme } from "@/theme/theme";

type Answer = { body: unknown; status?: number };
const ADMIN = createMeResponse({ email: "owner@example.com" });
const INVITED = {
  memberId: "018f0000-0000-7000-8000-000000000011",
  displayName: "One",
  email: "one@example.com",
  role: "viewer",
  status: "invited",
  joinedAt: null,
  lastSignedInAt: null,
  lastSeenAt: null,
  removedAt: null,
  createdAt: "2026-10-04T12:00:00.000Z",
  sessions: [],
  isLastActiveAdmin: false,
  invitation: {
    invitationId: "018f0000-0000-7000-8000-000000000012",
    invitedBy: ADMIN.me.member,
    createdAt: "2026-10-04T12:00:00.000Z",
    expiresAt: "2026-10-11T12:00:00.000Z",
    sendCount: 1,
    lastSentAt: "2026-10-04T12:00:00.000Z",
    revokedAt: null,
    acceptedAt: null,
    isPending: true,
  },
};
const MAIL = {
  status: "failing",
  diagnosis: { code: "from_address_unset", settingKey: "mail.from_address" },
  fromAddress: null,
  fromName: null,
  sendingDomain: null,
  domainVerifiedAt: null,
  domainLastCheckError: null,
  isBaseUrlSet: true,
  queue: {
    queuedCount: 0,
    failedCount: 0,
    suppressedCount: 0,
    sentLast24hCount: 0,
    oldestQueuedAt: null,
    lastSentAt: null,
    lastFailedAt: null,
  },
  lastError: null,
  suppressedAddressCount: 0,
};
mailHealthResponseSchema.parse(MAIL);
adminMemberDtoSchema.parse(INVITED);
function _render(
  path: string,
  answer: (path: string, init?: RequestInit) => Promise<Answer> | Answer,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const response = await answer(url, init);
      return response.status === 204
        ? new Response(null, { status: 204 })
        : Response.json(response.body, { status: response.status ?? 200 });
    }),
  );
  const router = createRouter({
    scrollRestoration: false,
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={client}>
      <MantineProvider theme={theme}>
        <RouterProvider router={router as never} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { router, client };
}
function _default(path: string): Answer {
  if (path === "/api/setup") return { body: { isRequired: false } };
  if (path === "/api/setup/progress")
    return { body: { needsInvitations: false } };
  if (path === "/api/me") return { body: ADMIN };
  if (path === "/api/mail/health") return { body: MAIL };
  if (path === "/api/upload-sessions/current")
    return { body: null, status: 204 };
  if (path === "/api/timeline")
    return { body: { days: [], nextCursor: null, resultCount: null } };
  if (path === "/api/timeline/rail")
    return { body: { days: [], nextCursor: null } };
  if (path === "/api/filters/facets")
    return { body: { tags: [], people: [], resultCount: 0 } };
  if (path === "/api/tags") return { body: { tags: [], nextCursor: null } };
  if (path === "/api/people")
    return { body: { people: [], peopleCount: 0, nextCursor: null } };
  return {
    body: { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" },
  };
}
async function _fill() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Your name"), "Owner");
  await user.type(screen.getByLabelText("Your email"), "Owner@Example.com");
  await user.click(screen.getByRole("button", { name: "Review your email" }));
  return user;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("cold deep load opens setup and reviews a normalized permanent address before creation", async () => {
  let initialized = false;
  let submitted: unknown;
  const { router, client } = _render("/items/abc", (path, init) => {
    if (path === "/api/setup" && init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      initialized = true;
      return { body: { ...CREATED_SESSION, ...ADMIN }, status: 201 };
    }
    if (path === "/api/setup") return { body: { isRequired: !initialized } };
    if (path === "/api/setup/progress")
      return { body: { needsInvitations: true } };
    return _default(path);
  });
  const user = await _fill();
  expect(submitted).toBeUndefined();
  expect(screen.getByText("owner@example.com")).toBeVisible();
  expect(screen.getByText(/permanent sign-in address/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  await screen.findByRole("heading", { name: "Invite your people." });
  expect(submitted).toMatchObject({
    admin: { email: "owner@example.com" },
    public: { baseUrl: window.location.origin },
    shoebox: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
  expect(submitted).not.toHaveProperty("mail");
  expect(client.getQueryData(["me"])).toMatchObject({ me: ADMIN.me });
  expect(router.state.location.pathname).toBe("/setup/invite");
});
it("root read failure exposes retry and never assumes an empty catalog", async () => {
  let failed = true;
  _render("/items/abc", (path) => {
    return path === "/api/setup"
      ? failed
        ? {
            body: { error: "unavailable", message: "Unavailable" },
            status: 503,
          }
        : { body: { isRequired: true } }
      : _default(path);
  });
  expect(
    await screen.findByRole("heading", {
      name: "Could not open this Shoebox.",
    }),
  ).toBeVisible();
  failed = false;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("heading", { name: "Set up your Shoebox." }),
  ).toBeVisible();
});
it("a cached initialized result is refreshed when the catalog now needs setup", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["setup", "status"], { isRequired: false });
  _render(
    "/people",
    (path) => {
      return path === "/api/setup"
        ? { body: { isRequired: true } }
        : _default(path);
    },
    client,
  );
  expect(
    await screen.findByRole("heading", { name: "Set up your Shoebox." }),
  ).toBeVisible();
});
it.each(["not-an-email", "123", "true"])(
  "join prefills %s without requesting or granting access",
  async (address) => {
    const { router } = _render(`/join?address=${address}`, (path) => {
      return path === "/api/me"
        ? {
            body: { error: "not_signed_in", message: "Signed out" },
            status: 401,
          }
        : _default(path);
    });
    expect(await screen.findByLabelText("Your email")).toHaveValue(address);
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(
      vi.mocked(fetch).mock.calls.some(([path]) => {
        return String(path).includes("sign-in-codes");
      }),
    ).toBe(false);
  },
);
it("pending admin reload reaches invites, preserves successes and retries only failures", async () => {
  let complete = false;
  let failed = true;
  const requests: string[] = [];
  const { router } = _render("/", (path, init) => {
    if (path === "/api/setup/progress")
      return { body: { needsInvitations: !complete } };
    if (path === "/api/setup/complete") {
      complete = true;
      return { body: null, status: 204 };
    }
    if (path === "/api/members" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      requests.push(body.email);
      if (body.email === "two@example.com" && failed)
        return {
          body: { error: "rate_limited", message: "Wait" },
          status: 429,
        };
      return { body: { ...INVITED, email: body.email }, status: 201 };
    }
    return _default(path);
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Add another person" }));
  await user.type(screen.getByLabelText("Email 2"), "two@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await screen.findByText("Invitation queued for one@example.com.");
  expect(requests).toEqual(["one@example.com", "two@example.com"]);
  failed = false;
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/");
  });
  expect(requests).toEqual([
    "one@example.com",
    "two@example.com",
    "two@example.com",
  ]);
});
it("lost invitation response recovers only a matching pending admin row", async () => {
  let complete = false;
  let posts = 0;
  const { router } = _render("/setup/invite", (path, init) => {
    if (path === "/api/setup/progress")
      return { body: { needsInvitations: !complete } };
    if (path === "/api/setup/complete") {
      complete = true;
      return { body: null, status: 204 };
    }
    if (path === "/api/members" && init?.method === "POST") {
      posts++;
      throw new TypeError("Lost response");
    }
    if (path === "/api/members")
      return {
        body: {
          shape: "admin",
          members: [INVITED],
          activeAdminCount: 1,
          nextCursor: null,
        },
      };
    return _default(path);
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/");
  });
  expect(posts).toBe(1);
});
it("ordinary existing-member conflicts stay failures and allow skip", async () => {
  let complete = false;
  const { router } = _render("/setup/invite", (path, init) => {
    if (path === "/api/setup/progress")
      return { body: { needsInvitations: !complete } };
    if (path === "/api/setup/complete") {
      complete = true;
      return { body: null, status: 204 };
    }
    if (path === "/api/members" && init?.method === "POST")
      return {
        body: { error: "member_already_exists", message: "Exists" },
        status: 409,
      };
    if (path === "/api/members")
      return {
        body: {
          shape: "admin",
          members: [INVITED],
          activeAdminCount: 1,
          nextCursor: null,
        },
      };
    return _default(path);
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  expect(await screen.findByText(/already has an account/)).toBeVisible();
  expect(
    screen.queryByText("Invitation queued for one@example.com."),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Skip for now" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/");
  });
});
it.each([true, false])(
  "lost creation response recovers cookie=%s or goes to ordinary sign-in",
  async (hasCookie) => {
    let created = false;
    const { router } = _render("/setup", (path, init) => {
      if (path === "/api/setup" && init?.method === "POST") {
        created = true;
        throw new TypeError("Lost response");
      }
      if (path === "/api/setup") return { body: { isRequired: !created } };
      if (path === "/api/me")
        return hasCookie && created
          ? { body: ADMIN }
          : {
              body: { error: "not_signed_in", message: "No session" },
              status: 401,
            };
      if (path === "/api/setup/progress")
        return { body: { needsInvitations: true } };
      return _default(path);
    });
    const user = await _fill();
    await user.click(
      screen.getByRole("button", { name: "Create your Shoebox" }),
    );
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe(
        hasCookie ? "/setup/invite" : "/sign-in",
      );
    });
    expect(router.state.location.search).toEqual({});
  },
);
it("a stale setup tab receives conflict then follows sign-in", async () => {
  let created = false;
  const { router } = _render("/setup", (path, init) => {
    if (path === "/api/setup" && init?.method === "POST") {
      created = true;
      return {
        body: { error: "setup_already_completed", message: "Configured" },
        status: 409,
      };
    }
    if (path === "/api/setup") return { body: { isRequired: !created } };
    if (path === "/api/me")
      return {
        body: { error: "not_signed_in", message: "No session" },
        status: 401,
      };
    return _default(path);
  });
  const user = await _fill();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/sign-in");
  });
});
it("nested server validation maps to the labelled field and focuses it", async () => {
  _render("/setup", (path, init) => {
    return path === "/api/setup"
      ? init?.method === "POST"
        ? {
            body: {
              error: "invalid_request",
              message: "Invalid",
              details: {
                fieldErrors: { "admin.email": ["Use a different email."] },
              },
            },
            status: 400,
          }
        : { body: { isRequired: true } }
      : _default(path);
  });
  const user = await _fill();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  expect(await screen.findByText("Use a different email.")).toBeVisible();
  await waitFor(() => {
    return expect(screen.getByLabelText("Your email")).toHaveFocus();
  });
});
it("invalid browser timezone falls back to UTC and sender inbox stays separate", async () => {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...Intl.DateTimeFormat().resolvedOptions(),
    timeZone: "Invalid/Zone",
  });
  _render("/setup", (path) => {
    return path === "/api/setup"
      ? { body: { isRequired: true } }
      : _default(path);
  });
  expect(await screen.findByLabelText("Timezone")).toHaveValue("UTC");
  expect(screen.getByLabelText("Sender email (optional)")).toHaveValue("");
});
it("non-admin invitation access goes home without reading private setup progress", async () => {
  const { router } = _render("/setup/invite", (path) => {
    return path === "/api/me"
      ? { body: createMeResponse({ role: "viewer" }) }
      : _default(path);
  });
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/");
  });
  expect(
    vi.mocked(fetch).mock.calls.some(([path]) => {
      return path === "/api/setup/progress";
    }),
  ).toBe(false);
});
it("review Back preserves edits, sender differs from inbox, and setup writes no browser storage", async () => {
  const localWrites = vi.spyOn(Storage.prototype, "setItem");
  let created = false;
  let submitted: unknown;
  const { router } = _render("/setup", (path, init) => {
    if (path === "/api/setup" && init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      created = true;
      return { body: { ...CREATED_SESSION, ...ADMIN }, status: 201 };
    }
    if (path === "/api/setup") {
      return { body: { isRequired: !created } };
    }
    if (path === "/api/setup/progress") {
      return { body: { needsInvitations: true } };
    }
    return _default(path);
  });
  const user = await _fill();
  await user.click(screen.getByRole("button", { name: "Go back and edit" }));
  expect(screen.getByLabelText("Your name")).toHaveValue("Owner");
  await user.type(
    screen.getByLabelText("Sender email (optional)"),
    "family@example.com",
  );
  await user.clear(screen.getByLabelText("Public URL"));
  await user.type(
    screen.getByLabelText("Public URL"),
    "https://family.example.com",
  );
  await user.click(screen.getByRole("button", { name: "Review your email" }));
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  await screen.findByRole("heading", { name: "Invite your people." });
  expect(submitted).toMatchObject({
    mail: { fromAddress: "family@example.com", fromName: null },
    public: { baseUrl: "https://family.example.com" },
  });
  expect(localWrites).not.toHaveBeenCalled();
  expect(router.state.location.search).toEqual({});
  expect(
    await screen.findByText(/Set a sender email in Shoebox settings/),
  ).toBeVisible();
});
it("invalid intended row prevents every invitation write and focuses its email", async () => {
  _render("/setup/invite", _default);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Add another person" }));
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  expect(screen.getByLabelText("Email 2")).toHaveFocus();
  expect(
    vi.mocked(fetch).mock.calls.filter(([path, init]) => {
      return path === "/api/members" && init?.method === "POST";
    }),
  ).toHaveLength(0);
  expect(screen.getByLabelText("Role 1").tagName).toBe("SELECT");
});
it("an uncertain draft rechecks the pending directory before retrying a lost response", async () => {
  let directoryAvailable = false;
  let complete = false;
  let posts = 0;
  const { router } = _render("/setup/invite", (path, init) => {
    if (path === "/api/setup/progress") {
      return { body: { needsInvitations: !complete } };
    }
    if (path === "/api/setup/complete") {
      complete = true;
      return { body: null, status: 204 };
    }
    if (path === "/api/members" && init?.method === "POST") {
      posts++;
      throw new TypeError("Lost response");
    }
    if (path === "/api/members") {
      if (!directoryAvailable) {
        return {
          body: { error: "unavailable", message: "Unavailable" },
          status: 503,
        };
      }
      return {
        body: {
          shape: "admin",
          members: [INVITED],
          activeAdminCount: 1,
          nextCursor: null,
        },
      };
    }
    return _default(path);
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await screen.findByText(/Could not confirm this invitation/);
  directoryAvailable = true;
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/");
  });
  expect(posts).toBe(1);
});
it("a creation rejection without field details still explains how to retry", async () => {
  _render("/setup", (path, init) => {
    if (path === "/api/setup") {
      return init?.method === "POST"
        ? {
            body: { error: "invalid_request", message: "Invalid request" },
            status: 400,
          }
        : { body: { isRequired: true } };
    }
    return _default(path);
  });
  const user = await _fill();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/try again/);
});
it("repeated unavailable directory reads retain uncertain invitation recovery before any new write", async () => {
  let directoryAvailable = false;
  let complete = false;
  let posts = 0;
  let reads = 0;
  const { router } = _render("/setup/invite", (path, init) => {
    if (path === "/api/setup/progress") {
      return { body: { needsInvitations: !complete } };
    }
    if (path === "/api/setup/complete") {
      complete = true;
      return { body: null, status: 204 };
    }
    if (path === "/api/members" && init?.method === "POST") {
      posts++;
      throw new TypeError("Lost response");
    }
    if (path === "/api/members") {
      reads++;
      return directoryAvailable
        ? {
            body: {
              shape: "admin",
              members: [INVITED],
              activeAdminCount: 1,
              nextCursor: null,
            },
          }
        : {
            body: { error: "unavailable", message: "Unavailable" },
            status: 503,
          };
    }
    return _default(path);
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await screen.findByText(/Could not confirm this invitation/);
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    expect(reads).toBe(2);
  });
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Retry invitations" }),
    ).not.toHaveAttribute("data-loading");
  });
  directoryAvailable = true;
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/");
  });
  expect(posts).toBe(1);
});
it("speculative preload makes no setup reads and actual navigation still refreshes status", async () => {
  let isRequired = false;
  let statusReads = 0;
  const { router } = _render("/people", (path) => {
    if (path === "/api/setup") {
      statusReads++;
      return { body: { isRequired } };
    }
    return _default(path);
  });
  await screen.findByRole("heading", { name: "Everybody in the archive." });
  const readsBefore = statusReads;
  await router.preloadRoute({
    to: "/items/$itemId",
    params: { itemId: "abc" },
  });
  expect(statusReads).toBe(readsBefore);
  isRequired = true;
  await router.navigate({ to: "/items/$itemId", params: { itemId: "abc" } });
  await screen.findByRole("heading", { name: "Set up your Shoebox." });
  expect(statusReads).toBeGreaterThan(readsBefore);
});
