import { MantineProvider } from "@mantine/core";
import type {
  GetSettingsResponse,
  MailHealthResponse,
  TimezoneImpactDto,
  UpdateSettingsResponse,
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
import { theme } from "@/theme/theme";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  respondWith,
  type Answer,
} from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

/** Complete six-key settings and storage response used by the real surface. */
export const SETTINGS: GetSettingsResponse = {
  shoebox: { name: "My Shoebox", timezone: "Europe/Madrid" },
  pile: { arrangement: "messy" },
  mail: { fromAddress: "shoebox@example.com", fromName: "Family" },
  public: { baseUrl: "https://shoebox.example.com" },
  defaultedKeys: [],
  changedBy: [],
  storage: { itemCount: 2147, byteSize: 61400000000 },
};
/** Hand-checked preview consequences including a real milestone reference. */
export const IMPACT: TimezoneImpactDto = {
  fromZone: "Europe/Madrid",
  toZone: "Asia/Manila",
  movingItemCount: 34,
  burstEjectionItemCount: 3,
  milestoneMismatches: [
    {
      milestone: {
        milestoneId: "018f0000-0000-7000-8000-000000000010",
        name: "Birthday",
        startsOn: "2026-09-26",
        endsOn: "2026-09-26",
        blurb: null,
      },
      itemCount: 2,
    },
  ],
};
/** Full safe mail-health shape; cases replace only their relevant diagnosis. */
export const HEALTH: MailHealthResponse = {
  status: "ok",
  diagnosis: null,
  fromAddress: "shoebox@example.com",
  fromName: "Family",
  sendingDomain: "example.com",
  domainVerifiedAt: "2026-09-27T08:00:00.000Z",
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
/** A committed PATCH response with independently supplied consequences. */
export function saved(
  overrides: Readonly<Partial<GetSettingsResponse>> = {},
  impact: TimezoneImpactDto | null = null,
): UpdateSettingsResponse {
  return {
    ...SETTINGS,
    ...overrides,
    isPreview: false,
    timezoneImpact: impact,
  };
}
/** Renders Settings through the actual protected route and its shared query client. */
export function renderSettings(
  options: { role?: "admin" | "viewer"; routes?: Record<string, Answer> } = {},
): { queryClient: QueryClient; router: Router<typeof routeTree> } {
  respondWith({
    "GET /api/me": {
      status: 200,
      body: createMeResponse({ role: options.role ?? "admin" }),
    },
    "GET /api/settings": { status: 200, body: SETTINGS },
    "GET /api/mail/health": { status: 200, body: HEALTH },
    "GET /api/timeline": {
      status: 200,
      body: { days: [], nextCursor: null, resultCount: null },
    },
    ...options.routes,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
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
