import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListMySessionsResponse } from "@memory-shoebox/shared";
import { routeTree } from "@/routeTree.gen";
import { createMeResponse } from "@/testing/createMeResponse";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

const ADMIN = createMeResponse();
const VIEWER = createMeResponse({ role: "viewer" });

/** The device this browser is on, and one it is not. */
const THIS_PHONE = "018f0000-0000-7000-8000-0000000000a1";
const THAT_LAPTOP = "018f0000-0000-7000-8000-0000000000a2";

const DEVICES: ListMySessionsResponse = {
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
const ADMIN_DOORS = [
  "Shoebox settings",
  "Members and groups",
  "Milestones",
  "Who has been looking",
  "Removal requests",
];

/** One canned reply, optionally held open while a case presses something. */
type Answer = {
  body: unknown;
  status: number;
  waitFor?: Promise<unknown>;
};

/** Everything the surface asks for, answered the way the server would. */
function _defaultAnswers(): Record<string, Answer> {
  return {
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
function _respondWith(routes: Readonly<Record<string, Answer>> = {}): void {
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
function _renderAccount() {
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
function _getBodiesSentTo(method: string, path: string): unknown[] {
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
function _respondLikeAServer(): {
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
        const answer =
          path === "/api/me"
            ? { body: account, status: 200 }
            : (_defaultAnswers()[`${method} ${path}`] ?? {
                body: {},
                status: 404,
              });
        return new Response(JSON.stringify(answer.body), {
          status: answer.status,
          headers: { "content-type": "application/json" },
        });
      }

      const body = JSON.parse(String(init?.body));
      const isNameSave = body.notify === undefined;
      account = isNameSave
        ? {
            ...account,
            me: {
              ...account.me,
              member: { ...account.me.member, displayName: body.displayName },
              storedDisplayName: body.displayName,
            },
          }
        : { ...account, me: { ...account.me, notify: body.notify } };
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
function _countCallsTo(method: string, path: string): number {
  return _getBodiesSentTo(method, path).length;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 9", () => {
  it("names the member and the Shoebox", async () => {
    _respondWith();
    _renderAccount();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Papá, in My Shoebox.",
      }),
    ).toBeVisible();
  });

  it("opens the five admin doors for an admin", async () => {
    _respondWith();
    _renderAccount();

    await screen.findByRole("heading", { name: "You run this archive" });
    ADMIN_DOORS.forEach((door) => {
      expect(screen.getByRole("link", { name: door })).toBeVisible();
    });
  });

  it("shows a viewer no admin doors at all", async () => {
    _respondWith({ "GET /api/me": { body: VIEWER, status: 200 } });
    _renderAccount();

    await screen.findByRole("heading", { name: "Where you are signed in" });
    ADMIN_DOORS.forEach((door) => {
      expect(screen.queryByRole("link", { name: door })).toBeNull();
    });
  });

  it("saves a name with one PATCH carrying only the name", async () => {
    const user = userEvent.setup();
    _respondWith({
      "PATCH /api/me": {
        body: createMeResponse({ displayName: "Abuela" }),
        status: 200,
      },
    });
    _renderAccount();

    const field = await screen.findByLabelText("Your name");
    await user.clear(field);
    await user.type(field, "Abuela");
    await user.click(screen.getByRole("button", { name: "Save your name" }));

    await waitFor(() => {
      expect(_getBodiesSentTo("PATCH", "/api/me")).toEqual([
        { displayName: "Abuela" },
      ]);
    });
    expect(await screen.findByText("Saved.")).toBeVisible();
  });

  it("saves a switch with one PATCH carrying all four booleans", async () => {
    const user = userEvent.setup();
    _respondWith();
    _renderAccount();

    await user.click(
      await screen.findByLabelText("Somebody puts photographs up"),
    );

    await waitFor(() => {
      expect(_getBodiesSentTo("PATCH", "/api/me")).toEqual([
        {
          notify: {
            onUpload: false,
            onComment: true,
            onReply: true,
            onRemoval: true,
          },
        },
      ]);
    });
  });

  // Decision 4: a switch moves when it is flipped, not when the server
  // answers. `EmailSheet` reads `checked` straight off its prop and holds no
  // state, so only an optimistic cache write can make this true.
  it("moves the switch before the server has answered", async () => {
    const user = userEvent.setup();
    let letThePatchLand = (): void => {};
    _respondWith({
      "PATCH /api/me": {
        body: ADMIN,
        status: 200,
        waitFor: new Promise<void>((settle) => {
          letThePatchLand = settle;
        }),
      },
    });
    _renderAccount();

    const aSwitch = await screen.findByLabelText(
      "Somebody puts photographs up",
    );
    expect(aSwitch).toBeChecked();
    await user.click(aSwitch);

    expect(aSwitch).not.toBeChecked();
    letThePatchLand();
  });

  it("puts the switch back when the save fails, and says so", async () => {
    const user = userEvent.setup();
    _respondWith({
      "PATCH /api/me": {
        body: { error: "internal_error", message: "Something broke." },
        status: 500,
      },
    });
    _renderAccount();

    const aSwitch = await screen.findByLabelText(
      "Somebody puts photographs up",
    );
    await user.click(aSwitch);

    expect(
      await screen.findByText("That did not save. Try again."),
    ).toBeVisible();
    expect(aSwitch).toBeChecked();
  });

  it("signs this device out through the route that needs no session id", async () => {
    const user = userEvent.setup();
    _respondWith();
    const router = _renderAccount();

    // The row's button and the modal's confirmation share their words, so
    // the modal is reached through its own dialog rather than by name.
    await user.click(
      await screen.findByRole("button", { name: "Sign out here" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Sign out here" }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(_countCallsTo("DELETE", "/api/auth/session")).toBe(1);
    expect(_countCallsTo("DELETE", `/api/me/sessions/${THIS_PHONE}`)).toBe(0);
  });

  it("signs another device out by its own id, and stays where it is", async () => {
    const user = userEvent.setup();
    _respondWith();
    const router = _renderAccount();

    await user.click(
      await screen.findByRole("button", { name: "Sign out MacBook, Chrome" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Sign it out" }),
    );

    await waitFor(() => {
      expect(_countCallsTo("DELETE", `/api/me/sessions/${THAT_LAPTOP}`)).toBe(
        1,
      );
    });
    expect(_countCallsTo("DELETE", "/api/auth/session")).toBe(0);
    expect(router.state.location.pathname).toBe("/account");
  });

  it("treats a device that had already gone as news rather than a failure", async () => {
    const user = userEvent.setup();
    _respondWith({
      [`DELETE /api/me/sessions/${THAT_LAPTOP}`]: {
        body: { error: "session_not_found", message: "No such session." },
        status: 404,
      },
    });
    _renderAccount();

    await user.click(
      await screen.findByRole("button", { name: "Sign out MacBook, Chrome" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Sign it out" }),
    );

    const said = await screen.findByText("That device had already gone.");
    expect(said).toBeVisible();
    // Inside the devices card, where `YouSheet` and `EmailSheet` already put
    // theirs, rather than loose on the page behind it.
    expect(
      screen.getByRole("region", { name: "Your devices" }),
    ).toContainElement(said);
    await waitFor(() => {
      expect(_countCallsTo("GET", "/api/me/sessions")).toBe(2);
    });
  });

  // `design-spec.md` is explicit that the prototype designs no loading state
  // and that whoever builds the surface owns it. These two cases are that
  // ownership: the sheet stays on screen and only its middle changes, so a
  // list that has not arrived never looks like an account with no devices.
  it("says the devices are on their way while the list has not arrived", async () => {
    _respondWith({
      "GET /api/me/sessions": {
        body: DEVICES,
        status: 200,
        waitFor: new Promise<void>(() => {}),
      },
    });
    _renderAccount();

    expect(
      await screen.findByText(
        "The devices you are signed in on are on their way.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Where you are signed in" }),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a way to try again when the list does not arrive at all", async () => {
    const user = userEvent.setup();
    _respondWith({
      "GET /api/me/sessions": {
        body: { error: "internal_error", message: "Broke." },
        status: 500,
      },
    });
    _renderAccount();

    const said = await screen.findByText(
      "We could not fetch your devices just now.",
    );
    expect(
      screen.getByRole("region", { name: "Your devices" }),
    ).toContainElement(said);
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.queryByText("The devices you are signed in on are on their way."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(_countCallsTo("GET", "/api/me/sessions")).toBe(2);
    });
  });

  // Every answer to `PATCH /api/me` is the whole `MeResponse`, so two saves
  // in flight together can each put the other's field back: whichever
  // response lands last wins, and `staleTime: Infinity` means nothing ever
  // refetches to correct it. `scope: { id: "me" }` removes the race by
  // serialising the two requests, so the second is sent only once the first
  // has been applied and its answer therefore carries both changes.
  it("does not let one save revert the other's field", async () => {
    const user = userEvent.setup();
    const server = _respondLikeAServer();
    _renderAccount();

    const field = await screen.findByLabelText("Your name");
    await user.clear(field);
    await user.type(field, "Abuela");
    await user.click(screen.getByRole("button", { name: "Save your name" }));
    await user.click(screen.getByLabelText("Somebody puts photographs up"));

    // Out of order, which is the whole point: the switch's answer is
    // released first, before the name save it was started after.
    server.letTheSwitchSaveLand();
    server.letTheNameSaveLand();

    // Both saves have finished: the name shows its confirmation, which only
    // a settled name save can produce, and the switches are live again,
    // which only a settled switch save can produce. Asserting before both
    // have landed would pass on the losing answer on its way past.
    expect(await screen.findByText("Saved.")).toBeVisible();
    await waitFor(() => {
      expect(
        screen.getByLabelText("Somebody puts photographs up"),
      ).toBeEnabled();
    });

    expect(_countCallsTo("PATCH", "/api/me")).toBe(2);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Abuela, in My Shoebox.",
    );
    expect(
      screen.getByLabelText("Somebody puts photographs up"),
    ).not.toBeChecked();
  });

  it("says which version is running, beside the source link", async () => {
    _respondWith();
    _renderAccount();

    expect(
      await screen.findByRole("link", { name: "Get the source" }),
    ).toHaveAttribute("href", "https://github.com/jpsyx/memory-shoebox");
    expect(
      await screen.findByText("You are running version 0.0.0."),
    ).toBeVisible();
  });
});
