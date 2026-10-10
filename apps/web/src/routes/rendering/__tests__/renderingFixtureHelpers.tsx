import type {
  MailHealthResponse,
  GetSettingsResponse,
} from "@memory-shoebox/shared";
import { routeTree } from "@/routeTree.gen";
import { createMeResponse } from "@/testing/createMeResponse";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type Router,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { vi } from "vitest";

const ME: ReturnType<typeof createMeResponse> = createMeResponse();
const SETTINGS_RESPONSE: GetSettingsResponse = {
  version: "2.4.1",
  shoebox: { name: "My Shoebox", timezone: "Europe/Madrid" },
  pile: { arrangement: "messy" },
  mail: { fromAddress: null, fromName: null },
  public: { baseUrl: "http://localhost:5173" },
  defaultedKeys: [],
  changedBy: [],
  storage: { itemCount: 0, byteSize: 0 },
};
const SETTINGS_MAIL_HEALTH: MailHealthResponse = {
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

/**
 * A blank archive, and the two vocabularies a blank filter surface reads.
 *
 * The timeline route now reads these five paths on every mount, so this
 * generic smoke test has to answer them too, or its query errors out and the
 * surface never settles on either of its headings.
 */
const EMPTY_TIMELINE_ANSWERS: Record<string, unknown> = {
  "/api/presence": { presence: [], nextCursor: null },
  "/api/activity": { activity: [], nextCursor: null },
  "/api/settings": SETTINGS_RESPONSE,
  "/api/mail/health": SETTINGS_MAIL_HEALTH,
  "/api/timeline": { days: [], nextCursor: null, resultCount: null },
  "/api/timeline/rail": { days: [], nextCursor: null },
  "/api/filters/facets": { tags: [], people: [], resultCount: 0 },
  "/api/tags": { tags: [], nextCursor: null },
  "/api/people": { people: [], nextCursor: null, peopleCount: 0 },
  "/api/members": {
    shape: "admin",
    members: [],
    nextCursor: null,
    activeAdminCount: 0,
  },
  "/api/groups": { shape: "admin", groups: [], nextCursor: null },
  "/api/milestones": { milestones: [], nextCursor: null },
  "/api/removal-requests?state=open": {
    removalRequests: [],
    nextCursor: null,
    openCount: 0,
    settledCount: 0,
  },
  "/api/removal-requests?state=settled": {
    removalRequests: [],
    nextCursor: null,
    openCount: 0,
    settledCount: 0,
  },
};

/** Stubs a signed-in account and complete blank-archive responses. */
export function signInRenderingFixture(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/setup" || path === "/api/setup/progress") {
        return Response.json(
          path === "/api/setup"
            ? { isRequired: false }
            : { needsInvitations: false },
        );
      }
      if (path === "/api/upload-sessions/current") {
        return new Response(null, { status: 204 });
      }
      const body =
        path === "/api/public-settings"
          ? { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" }
          : path === "/api/me/sessions"
            ? { sessions: [], nextCursor: null }
            : path === "/api/health"
              ? { status: "ok", version: "0.0.0", uptimeSeconds: 1 }
              : (EMPTY_TIMELINE_ANSWERS[path] ?? ME);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** Stubs a signed-out account while allowing anonymous settings reads. */
export function signOutRenderingFixture(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/setup") {
        return Response.json({ isRequired: false });
      }
      const isAccount = path === "/api/me";
      return new Response(
        JSON.stringify(
          isAccount
            ? { error: "not_signed_in", message: "No live session." }
            : { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" },
        ),
        {
          status: isAccount ? 401 : 200,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
}

/** Renders the real router and returns it without waiting for a heading. */
export function renderRouterAt(path: string): Router<typeof routeTree> {
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

/** Opens the addressed route and returns its visible level-one heading. */
export async function renderRouteHeading(path: string): Promise<HTMLElement> {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <RouterProvider router={router as never} />
      </MantineProvider>
    </QueryClientProvider>,
  );

  return screen.findByRole("heading", { level: 1 });
}

/** Renders the timeline under StrictMode and returns its visible heading. */
export async function renderTimelineInStrictMode(): Promise<HTMLElement> {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
        >
          <RouterProvider router={router as never} />
        </MantineProvider>
      </QueryClientProvider>
    </StrictMode>,
  );

  return screen.findByRole("heading", { level: 1 });
}
