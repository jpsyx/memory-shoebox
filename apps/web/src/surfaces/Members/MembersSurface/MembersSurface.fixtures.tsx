import { MantineProvider } from "@mantine/core";
import type { AdminMemberDto, MeResponse } from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type Router,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";
import { createMeResponse } from "@/testing/createMeResponse";
import { theme } from "@/theme/theme";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import {
  respondWith,
  type Answer,
} from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

/** Active admin on this browser. */
export const ADMIN_ACCOUNT = createMeResponse();
/** Complete administrative DTO, with variations relevant to these tests. */
export function makeMember(
  overrides: Partial<AdminMemberDto> = {},
): AdminMemberDto {
  return {
    memberId: ADMIN_ACCOUNT.me.member.memberId,
    displayName: "Papá",
    email: "papa@example.com",
    role: "admin",
    status: "active",
    joinedAt: "2026-09-01T10:00:00.000Z",
    lastSeenAt: null,
    lastSignedInAt: null,
    removedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    invitation: null,
    sessions: [],
    isLastActiveAdmin: true,
    ...overrides,
  };
}
/** An invited admin who must never count as an active admin. */
export const INVITED = makeMember({
  memberId: "018f0000-0000-7000-8000-000000000002",
  displayName: "Tomás",
  email: "tomas@example.com",
  role: "admin",
  status: "invited",
  joinedAt: null,
  isLastActiveAdmin: false,
  invitation: {
    invitationId: "018f0000-0000-7000-8000-000000000003",
    invitedBy: ADMIN_ACCOUNT.me.member,
    createdAt: "2026-09-01T10:00:00.000Z",
    expiresAt: "2026-09-08T10:00:00.000Z",
    sendCount: 1,
    lastSentAt: "2026-09-01T10:00:00.000Z",
    revokedAt: null,
    acceptedAt: null,
    isPending: false,
  },
});
/** Real router and network boundary, without mocking component behavior. */
export function renderMembers(
  options: {
    members?: AdminMemberDto[];
    account?: MeResponse;
    routes?: Record<string, Answer>;
  } = {},
): { router: Router<typeof routeTree>; queryClient: QueryClient } {
  const members = options.members ?? [makeMember(), INVITED];
  const directory = {
    shape: "admin",
    members,
    nextCursor: null,
    activeAdminCount: members.filter((member) => {
      return member.role === "admin" && member.status === "active";
    }).length,
  };
  respondWith({
    "GET /api/me": { body: options.account ?? ADMIN_ACCOUNT, status: 200 },
    "GET /api/members": { body: directory, status: 200 },
    ...options.routes,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/members"] }),
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
  return { router, queryClient };
}
