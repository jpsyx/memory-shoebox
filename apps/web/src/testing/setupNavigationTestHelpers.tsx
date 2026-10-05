import { routeTree } from "@/routeTree.gen";
import { CREATED_SESSION } from "@/surfaces/SignIn/SignInCard/__tests__/SignInCard.fixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import { theme } from "@/theme/theme";
import { MantineProvider } from "@mantine/core";
import {
  adminMemberDtoSchema,
  mailHealthResponseSchema,
  type AdminMemberDto,
  type MailHealthResponse,
  type MeResponse,
} from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type Router,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

/** An API reply supplied by a setup navigation scenario. */
export type SetupAnswer = { body: unknown; status?: number };
/** An active admin account for setup and navigation tests. */
export const ADMIN = createMeResponse({
  email: "owner@example.com",
}) satisfies MeResponse;
/** A pending invitation belonging to the setup admin. */
export const INVITED = {
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
} as const satisfies AdminMemberDto;
/** Safe mail health before a sender address has been configured. */
export const MAIL = {
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
} as const satisfies MailHealthResponse;
mailHealthResponseSchema.parse(MAIL);
adminMemberDtoSchema.parse(INVITED);

const DEFAULT_ANSWERS: Readonly<Record<string, SetupAnswer>> = {
  "/api/setup": { body: { isRequired: false } },
  "/api/setup/progress": { body: { needsInvitations: false } },
  "/api/me": { body: ADMIN },
  "/api/mail/health": { body: MAIL },
  "/api/upload-sessions/current": { body: null, status: 204 },
  "/api/timeline": { body: { days: [], nextCursor: null, resultCount: null } },
  "/api/timeline/rail": { body: { days: [], nextCursor: null } },
  "/api/filters/facets": { body: { tags: [], people: [], resultCount: 0 } },
  "/api/tags": { body: { tags: [], nextCursor: null } },
  "/api/people": { body: { people: [], peopleCount: 0, nextCursor: null } },
} as const;

/** Returns ordinary replies for a setup scenario's untouched API routes. */
export function getSetupAnswerFromRequest(
  options: Readonly<{ path: string; init?: Readonly<RequestInit> }>,
): SetupAnswer {
  return (
    DEFAULT_ANSWERS[options.path] ?? {
      body: { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" },
    }
  );
}

/** Returns a rendered real route tree with an isolated query client. */
export function makeSetupNavigationHarnessFromOptions(
  options: Readonly<{
    path: string;
    answer: (
      request: Readonly<{ path: string; init?: Readonly<RequestInit> }>,
    ) => Promise<SetupAnswer> | SetupAnswer;
    client?: QueryClient;
  }>,
): { router: Router<typeof routeTree>; client: QueryClient } {
  const client =
    options.client ??
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const response = await options.answer({ path: url, init });
      return response.status === 204
        ? new Response(null, { status: 204 })
        : Response.json(response.body, { status: response.status ?? 200 });
    }),
  );
  const router = createRouter({
    scrollRestoration: false,
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: [options.path] }),
  });
  render(
    <QueryClientProvider client={client}>
      <MantineProvider theme={theme}>
        <RouterProvider router={router} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { router, client };
}

/** Reviews the initial admin's email through the visible setup controls. */
export async function fillSetupAccount(): Promise<
  ReturnType<typeof userEvent.setup>
> {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Your name"), "Owner");
  await user.type(screen.getByLabelText("Your email"), "Owner@Example.com");
  await user.click(screen.getByRole("button", { name: "Review your email" }));
  return user;
}

/** Returns an admin query client with cached authority and private devices. */
export function createCachedAdminQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["me"], ADMIN);
  client.setQueryData(["members", "admin"], {
    shape: "admin",
    members: [INVITED],
    nextCursor: null,
    activeAdminCount: 1,
  });
  client.setQueryData(["me", "sessions"], {
    sessions: [CREATED_SESSION.session],
    nextCursor: null,
  });
  return client;
}
