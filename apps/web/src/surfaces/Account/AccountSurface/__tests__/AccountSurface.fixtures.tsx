import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type Router,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type {
  ListMySessionsResponse,
  MeResponse,
  NotifyPreferences,
} from "@memory-shoebox/shared";
import { routeTree } from "@/routeTree.gen";
import { createMeResponse } from "@/testing/createMeResponse";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

/**
 * The accounts, the canned server, and the render, shared by the three
 * `AccountSurface` test files beside this one.
 *
 * It is a fixture file rather than anything the surface can reach: nothing
 * outside `__tests__/` imports it, which is what keeps the stubbed `fetch` and
 * the memory router out of the product.
 */

export const ADMIN = createMeResponse();
export const VIEWER = createMeResponse({ role: "viewer" });

/** The device this browser is on, and one it is not. */
export const THIS_PHONE = "018f0000-0000-7000-8000-0000000000a1";
export const THAT_LAPTOP = "018f0000-0000-7000-8000-0000000000a2";

export const DEVICES: ListMySessionsResponse = {
  sessions: [
    {
      sessionId: THIS_PHONE,
      deviceLabel: "iPhone, Safari",
      createdAt: "2026-09-20T10:00:00.000Z",
      lastUsedAt: "2026-09-28T10:00:00.000Z",
      expiresAt: "2026-10-28T10:00:00.000Z",
      isCurrent: true,
    },
    {
      sessionId: THAT_LAPTOP,
      deviceLabel: "MacBook, Chrome",
      createdAt: "2026-09-01T10:00:00.000Z",
      lastUsedAt: "2026-09-24T10:00:00.000Z",
      expiresAt: "2026-10-24T10:00:00.000Z",
      isCurrent: false,
    },
  ],
  nextCursor: null,
};

/** The five doors only an admin is meant to see. */
export const ADMIN_DOORS = [
  "Shoebox settings",
  "Members and groups",
  "Milestones",
  "Who has been looking",
  "Removal requests",
];

/** One canned reply, optionally held open while a case presses something. */
export type Answer = {
  body: unknown;
  status: number;
  waitFor?: Promise<unknown>;
};

/** Everything the surface asks for, answered the way the server would. */
function _defaultAnswers(): Record<string, Answer> {
  return {
    "GET /api/setup": { body: { isRequired: false }, status: 200 },
    "GET /api/setup/progress": {
      body: { needsInvitations: false },
      status: 200,
    },
    "GET /api/me": { body: ADMIN, status: 200 },
    "PATCH /api/me": { body: ADMIN, status: 200 },
    "GET /api/me/sessions": { body: DEVICES, status: 200 },
    "GET /api/health": {
      body: { status: "ok", version: "0.0.0", uptimeSeconds: 1 },
      status: 200,
    },
    "GET /api/public-settings": {
      body: { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" },
      status: 200,
    },
    "DELETE /api/auth/session": { body: undefined, status: 204 },
    [`DELETE /api/me/sessions/${THIS_PHONE}`]: { body: undefined, status: 204 },
    [`DELETE /api/me/sessions/${THAT_LAPTOP}`]: {
      body: undefined,
      status: 204,
    },
  };
}

/**
 * Answers each call by method and path, and records every one of them.
 *
 * Keyed by `"METHOD /path"` rather than by path alone, because this surface
 * is the first one that reads and writes the same route: `/api/me` is both
 * the account it renders and the thing a name or a switch saves to.
 */
export function respondWith(
  routes: Readonly<Record<string, Answer>> = {},
): void {
  const answers: Record<string, Answer> = { ..._defaultAnswers(), ...routes };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const answer = answers[`${init?.method ?? "GET"} ${path}`] ?? {
        body: { error: "not_found", message: "No such route." },
        status: 404,
      };
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
 * The surface, through the real router, at `/account`.
 *
 * One `QueryClient` for the router context and the provider both, which is
 * what `main.tsx` does and what this surface depends on: the guard puts the
 * account in the cache and the surface reads that same entry.
 *
 * @returns The router, so a case can assert where it ended up.
 */
export function renderAccount(): Router<typeof routeTree> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/account"] }),
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

/** Every body this surface sent to one method and path, already parsed. */
export function getBodiesSentTo(method: string, path: string): unknown[] {
  return vi
    .mocked(fetch)
    .mock.calls.filter((call) => {
      return call[0] === path && (call[1]?.method ?? "GET") === method;
    })
    .map((call) => {
      const body = call[1]?.body;
      return body === undefined || body === null
        ? undefined
        : JSON.parse(String(body));
    });
}

/**
 * The account as it stands after one `PATCH /api/me`.
 *
 * Applied the moment the request arrives rather than when its answer is
 * released, so each save's snapshot carries the other's change if the other
 * landed first. That ordering is the whole point of the race this stands in
 * for.
 */
function _applyPatchToAccount(
  account: MeResponse,
  body: { displayName?: string | null; notify?: NotifyPreferences },
): MeResponse {
  return body.notify === undefined
    ? {
        ...account,
        me: {
          ...account.me,
          member: { ...account.me.member, displayName: body.displayName ?? "" },
          storedDisplayName: body.displayName ?? null,
        },
      }
    : { ...account, me: { ...account.me, notify: body.notify } };
}

/**
 * A stand-in for the account row, so two saves can be raced against each
 * other honestly.
 *
 * Each `PATCH` is applied the moment it arrives, in arrival order, and the
 * answer is the whole `MeResponse` as it stood **just after that one was
 * applied**, which is what `PATCH /api/me` really returns. That snapshot is
 * the whole mechanism: a response carries the other fields as they were when
 * the server saw this request, so a response that overtakes another puts the
 * other's field back the way it was.
 *
 * The two answers are held until the case releases them, and they are
 * released out of order deliberately.
 *
 * @returns The two releases, named after the save each one belongs to.
 */
/**
 * Every route but the account write, answered from the account as it stands.
 *
 * `GET /api/me` reads the live object rather than a fixture, so a test that
 * reloads after a save sees what the save left behind.
 */
function _answerAnythingElse(
  method: string,
  path: string,
  account: MeResponse,
): Response {
  const answer =
    path === "/api/me"
      ? { body: account, status: 200 }
      : (_defaultAnswers()[`${method} ${path}`] ?? { body: {}, status: 404 });
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "content-type": "application/json" },
  });
}

export function respondLikeAServer(): {
  letTheNameSaveLand: () => void;
  letTheSwitchSaveLand: () => void;
} {
  let account = ADMIN;
  let releaseName = (): void => {};
  let releaseSwitch = (): void => {};
  const nameLanded = new Promise<void>((settle) => {
    releaseName = settle;
  });
  const switchLanded = new Promise<void>((settle) => {
    releaseSwitch = settle;
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "PATCH" || path !== "/api/me") {
        return _answerAnythingElse(method, path, account);
      }

      const body = JSON.parse(String(init?.body));
      const isNameSave = body.notify === undefined;
      account = _applyPatchToAccount(account, body);
      const snapshot = account;
      await (isNameSave ? nameLanded : switchLanded);
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  return {
    letTheNameSaveLand: releaseName,
    letTheSwitchSaveLand: releaseSwitch,
  };
}

/** How many times one method and path were called at all. */
export function countCallsTo(method: string, path: string): number {
  return getBodiesSentTo(method, path).length;
}
