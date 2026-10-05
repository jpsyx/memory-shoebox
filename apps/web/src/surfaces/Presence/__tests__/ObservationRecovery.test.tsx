import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { renderAt, respondWith, recordedUrls } from "@/testing/surfaceHarness";
import { createMeResponse } from "@/testing/createMeResponse";
import { ITEM_ID } from "@/testing/itemFixtureHelpers";
import {
  makePresenceRow,
  makeActivityEntry,
  OBSERVATION_MEMBER_ID,
} from "./observationFixtures";

const CASES = [
  {
    route: "/presence",
    path: "/api/presence",
    key: ["presence"],
    text: "Tomás",
    body: { presence: [makePresenceRow()], nextCursor: null },
  },
  {
    route: `/presence?itemId=${ITEM_ID}`,
    path: `/api/items/${ITEM_ID}/viewers`,
    key: ["observations"],
    text: "Tomás",
    body: {
      viewers: [
        {
          member: { memberId: OBSERVATION_MEMBER_ID, displayName: "Tomás" },
          hasOpened: true,
          firstSeenAt: null,
          firstOpenedAt: "2026-09-14T04:41:00.000Z",
          lastOpenedAt: "2026-09-14T04:41:00.000Z",
          openCount: 1,
        },
      ],
      nextCursor: null,
    },
  },
  {
    route: "/changes",
    path: "/api/activity",
    key: ["activity"],
    text: "Old iPhone",
    body: { activity: [makeActivityEntry()], nextCursor: "older" },
  },
];
it.each(CASES)(
  "$route labels cached rows stale after 503 and retries reads only",
  async (fixture) => {
    respondWith({
      [`GET ${fixture.path}`]: { status: 200, body: fixture.body },
    });
    const { router } = renderAt(fixture.route);
    await screen.findByText(fixture.text);
    const original = fetch;
    let failed = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path, init) => {
        if (String(path).startsWith(fixture.path) && failed) {
          return Response.json(
            { error: "unavailable", message: "Read unavailable" },
            { status: 503 },
          );
        }
        return original(path, init);
      }),
    );
    await act(async () => {
      await router.options.context!.queryClient.invalidateQueries({
        queryKey: fixture.key,
      });
    });
    expect(await screen.findByText(/Showing last-known records/)).toBeVisible();
    expect(screen.getByText(fixture.text)).toBeVisible();
    failed = false;
    await userEvent.click(
      screen.getByRole("button", { name: "Retry records" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByText(/Showing last-known records/),
      ).not.toBeInTheDocument();
    });
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM_ID}`);
  },
);
it.each(
  CASES.flatMap((fixture) => {
    return [401, 403].map((status) => {
      return { fixture, status };
    });
  }),
)(
  "$fixture.route suppresses cached rows and reconciles $status",
  async ({ fixture, status }) => {
    respondWith({
      [`GET ${fixture.path}`]: { status: 200, body: fixture.body },
    });
    const { router } = renderAt(fixture.route);
    await screen.findByText(fixture.text);
    _refuseObservation(fixture.path, status);
    await act(async () => {
      await router.options.context!.queryClient.invalidateQueries({
        queryKey: fixture.key,
      });
    });
    await waitFor(() => {
      expect(screen.queryByText(fixture.text)).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(router.options.context!.queryClient.getQueryData(["me"])).toEqual(
        status === 401
          ? null
          : expect.objectContaining({
              me: expect.objectContaining({ role: "viewer" }),
            }),
      );
    });
  },
);
it("a failed authority recheck hides rows and offers an explicit account retry", async () => {
  const fixture = CASES[0]!;
  respondWith({ "GET /api/presence": { status: 200, body: fixture.body } });
  const { router } = renderAt("/presence");
  await screen.findByText("Tomás");
  const allowAccount = _failAccountRecheck();
  await act(async () => {
    await router.options.context!.queryClient.invalidateQueries({
      queryKey: ["presence"],
    });
  });
  expect(
    await screen.findByText(
      /Your access could not be checked: Account check unavailable/,
    ),
  ).toBeVisible();
  expect(screen.queryByText("Tomás")).not.toBeInTheDocument();
  allowAccount();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry account check" }),
  );
  expect(
    await screen.findByText("Only an admin can view presence."),
  ).toBeVisible();
});
it("activity pagination refusal also removes earlier rows and reconciles access", async () => {
  const fixture = CASES[2]!;
  respondWith({ "GET /api/activity": { status: 200, body: fixture.body } });
  renderAt("/changes");
  await screen.findByText("Old iPhone");
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      if (String(path).startsWith("/api/activity?cursor=")) {
        return Response.json(
          { error: "forbidden", message: "Access refused" },
          { status: 403 },
        );
      }
      if (path === "/api/me") {
        return Response.json(createMeResponse({ role: "viewer" }));
      }
      return original(path, init);
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Load older changes" }),
  );
  expect(
    await screen.findByText("Only an admin can view changes."),
  ).toBeVisible();
  expect(screen.queryByText("Old iPhone")).not.toBeInTheDocument();
});

function _refuseObservation(pathPrefix: string, status: number): void {
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      if (String(path).startsWith(pathPrefix)) {
        return Response.json(
          {
            error: status === 401 ? "not_signed_in" : "forbidden",
            message: "Access refused",
          },
          { status },
        );
      }
      if (path === "/api/me") {
        return status === 401
          ? Response.json(
              { error: "not_signed_in", message: "Signed out" },
              { status: 401 },
            )
          : Response.json(createMeResponse({ role: "viewer" }));
      }
      return original(path, init);
    }),
  );
}

function _failAccountRecheck(): () => void {
  const original = fetch;
  let accountFailed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      if (path === "/api/presence") {
        return Response.json(
          { error: "forbidden", message: "Access refused" },
          { status: 403 },
        );
      }
      if (path === "/api/me") {
        return accountFailed
          ? Response.json(
              { error: "unavailable", message: "Account check unavailable" },
              { status: 503 },
            )
          : Response.json(createMeResponse({ role: "viewer" }));
      }
      return original(path, init);
    }),
  );
  return () => {
    accountFailed = false;
  };
}
