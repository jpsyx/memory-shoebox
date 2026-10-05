import { MantineProvider } from "@mantine/core";
import type {
  AdminGroupDto,
  GroupUsageResponse,
  MeResponse,
} from "@memory-shoebox/shared";
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
  makeMemberFromOverrides,
  INVITED,
} from "@/surfaces/Members/MembersSurface/__tests__/memberFixtureHelpers";
import {
  respondWith,
  type Answer,
} from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

/** A used group with distinct Only and Except consequences. */
export const GROUP: AdminGroupDto = {
  groupId: "018f0000-0000-7000-8000-000000000010",
  name: "Cousins",
  createdAt: "2026-09-01T10:00:00.000Z",
  members: [{ memberId: INVITED.memberId, displayName: INVITED.displayName }],
  usedByOnlyRules: 9,
  usedByExceptRules: 5,
};
/** The consent snapshot includes empty-allow-list and affected-member facts. */
export const USAGE: GroupUsageResponse = {
  group: GROUP,
  narrowingItemCount: 9,
  wideningItemCount: 5,
  emptyAllowListItemCount: 9,
  membersLosingAccess: [INVITED],
  membersGainingAccess: [
    { memberId: makeMemberFromOverrides().memberId, displayName: "Papá" },
  ],
  rules: [
    {
      ruleId: "rule-only",
      effect: "narrows",
      itemCount: 9,
      becomesEmptyAllowList: true,
      visibility: {
        visibilityRuleId: "rule-only",
        mode: "only",
        subjects: [
          { kind: "group", id: GROUP.groupId, displayName: GROUP.name },
        ],
        label: "Only Cousins",
      },
      visibilityAfter: {
        visibilityRuleId: "rule-only",
        mode: "only",
        subjects: [],
        label: "Only nobody",
      },
    },
  ],
  confirmationToken: "opaque/+?=old",
};
function _respondWithGroups({
  account,
  routes,
}: Readonly<{
  account: MeResponse;
  routes: Record<string, Answer> | undefined;
}>): void {
  respondWith({
    "GET /api/me": { body: account, status: 200 },
    "GET /api/groups": {
      body: { shape: "admin", groups: [GROUP], nextCursor: null },
      status: 200,
    },
    "GET /api/members": {
      body: {
        shape: "admin",
        members: [
          makeMemberFromOverrides(),
          INVITED,
          makeMemberFromOverrides({
            memberId: "018f0000-0000-7000-8000-000000000099",
            displayName: "Removed",
            status: "removed",
          }),
        ],
        activeAdminCount: 1,
        nextCursor: null,
      },
      status: 200,
    },
    [`GET /api/groups/${GROUP.groupId}/usage`]: { body: USAGE, status: 200 },
    ...routes,
  });
}

/** Renders Groups and returns its real router and shared query client. */
export function renderGroups({
  account = createMeResponse(),
  routes,
}: Readonly<{ account?: MeResponse; routes?: Record<string, Answer> }> = {}): {
  queryClient: QueryClient;
  router: Router<typeof routeTree>;
} {
  _respondWithGroups({ account, routes });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/groups"] }),
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
  return { queryClient, router };
}
