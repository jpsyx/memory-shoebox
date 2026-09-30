import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type Router,
} from "@tanstack/react-router";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { createMeResponse } from "@/testing/createMeResponse";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

/** One canned reply, optionally held open while a case presses something. */
export type Answer = {
  body: unknown;
  status: number;
  waitFor?: Promise<unknown>;
};

const recorded: string[] = [];

/** Every URL the app has asked for since `respondWith` was last called. */
export function recordedUrls(): string[] {
  return [...recorded];
}

/** What every surface needs before it draws anything at all. */
function _shellAnswers(): Record<string, Answer> {
  return {
    "GET /api/me": { body: createMeResponse(), status: 200 },
    "GET /api/health": {
      body: { status: "ok", version: "0.0.0", uptimeSeconds: 1 },
      status: 200,
    },
    "GET /api/public-settings": {
      body: { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" },
      status: 200,
    },
  };
}

/**
 * Stubs `fetch` with a map of canned answers, and forgets what was asked
 * before.
 *
 * The canned server half of this harness, for the surfaces that read several
 * routes. It is here rather than in a `__tests__` folder because the timeline
 * and the people directory both use it, and a fixture reached across two
 * surface folders is a fixture that belongs to neither.
 *
 * **Answers are keyed by the path before the `?`.** Every route in the archive
 * read path carries a query string, and keying on the whole URL would mean
 * writing the exact parameter order into every test. The full URLs are recorded
 * separately, so a test that cares what was asked for can still assert it.
 *
 * @param routes Answers keyed by `"METHOD /path"`, with no query string.
 * @param extraDefaults Answers every case in a file wants, such as a timeline.
 */
export function respondWith(
  routes: Readonly<Record<string, Answer>> = {},
  extraDefaults: Readonly<Record<string, Answer>> = {},
): void {
  recorded.length = 0;
  const answers: Record<string, Answer> = {
    ..._shellAnswers(),
    ...extraDefaults,
    ...routes,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      recorded.push(String(path));
      const pathOnly = String(path).split("?")[0] ?? "";
      const answer = answers[`${init?.method ?? "GET"} ${pathOnly}`] ?? {
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
 * Renders the app at one address, through the real router.
 *
 * One `QueryClient` for the router context and the provider both, which is what
 * `main.tsx` does and what the guard depends on: it puts the account in the
 * cache and the surface reads that same entry.
 *
 * @param initialPath Where to start, for example `/?tag=t1`.
 * @returns The render result and the router, so a case can assert where it
 *   ended up. Synchronous, like `renderAccount`: a case waits with `findBy`
 *   rather than on the router.
 */
export function renderAt(
  initialPath: string,
): RenderResult & { router: Router<typeof routeTree> } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        {/* The cast is what `renderAccount` already does: the generated route
            tree and a router built from it do not line up structurally under
            `RouterProvider`'s props. */}
        <RouterProvider router={router as never} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...result, router };
}
