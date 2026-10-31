import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  renderTimeline,
  respondWith,
} from "../TimelineSurface/__tests__/timelineSurfaceTestHelpers";

const MEMBER = "018f0000-0000-7000-8000-000000000021";
const OTHER_MEMBER = "018f0000-0000-7000-8000-000000000022";
const TAG = "018f0000-0000-7000-8000-000000000023";
const identity = { memberId: MEMBER, displayName: "Jorge", avatar: null };
const emptyPage = {
  days: [],
  nextCursor: null,
  previousCursor: null,
  resultCount: 0,
};

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function _answerCollection(member: typeof identity | null = identity): void {
  respondWith({
    [`GET /api/member-collections/${MEMBER}`]: {
      status: 200,
      body: { member },
    },
  });
}

it("opens a standalone collection with identity and one removable OR filter", async () => {
  _answerCollection();
  const { router } = renderTimeline(`/?member=${MEMBER}&tag=${TAG}`);
  expect(await screen.findByRole("heading", { name: "Jorge" })).toBeVisible();
  expect(
    screen.getByText(
      "Photos and videos uploaded by or photo-tagged with Jorge",
    ),
  ).toBeVisible();
  expect(screen.getByText("Jorge: uploaded or photo-tagged")).toBeVisible();
  expect(
    screen.getAllByRole("button", { name: "Stop filtering by Jorge" }),
  ).toHaveLength(1);
  expect(screen.queryByText("Back to comment")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to the timeline" }),
  ).toHaveAttribute("href", "/");
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Stop filtering by Jorge" }),
    );
  });
  await waitFor(() => {
    expect(router.state.location.search).toEqual({ tag: [TAG] });
  });
});

it.each([null, identity])(
  "shows the same private empty collection for unknown and retained identities",
  async (member) => {
    respondWith({
      [`GET /api/member-collections/${MEMBER}`]: {
        status: 200,
        body: { member },
      },
      "GET /api/timeline": { status: 200, body: emptyPage },
      "GET /api/timeline/rail": {
        status: 200,
        body: { days: [], nextCursor: null },
      },
      "GET /api/filters/facets": {
        status: 200,
        body: { tags: [], people: [], resultCount: 0 },
      },
    });
    renderTimeline(`/?member=${MEMBER}`);
    expect(
      await screen.findByText("No photos or videos to show."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: member ? "Jorge" : "Photos and videos",
      }),
    ).toBeVisible();
    expect(screen.queryByText(MEMBER)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/not a member|shared with you yet|nothing matches/i),
    ).not.toBeInTheDocument();
  },
);

it("retries a failed identity read without removing the collection", async () => {
  respondWith({
    [`GET /api/member-collections/${MEMBER}`]: { status: 503, body: {} },
  });
  const { router } = renderTimeline(`/?member=${MEMBER}`);
  expect(
    await screen.findByText("Couldn't load these photos and videos."),
  ).toBeVisible();
  _answerCollection();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  });
  expect(await screen.findByRole("heading", { name: "Jorge" })).toBeVisible();
  expect(router.state.location.search).toEqual({ member: MEMBER });
});

it("refreshes the current name when revisiting a collection", async () => {
  _answerCollection();
  const { router } = renderTimeline(`/?member=${MEMBER}`);
  await screen.findByRole("heading", { name: "Jorge" });
  await act(async () => {
    await router.navigate({ to: "/", search: {} });
  });
  _answerCollection({ ...identity, displayName: "Jorge M" });
  await act(async () => {
    await router.navigate({ to: "/", search: { member: MEMBER } });
  });
  expect(await screen.findByRole("heading", { name: "Jorge M" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Jorge" }),
  ).not.toBeInTheDocument();
});

it("does not publish an old identity after switching collection mid-read", async () => {
  _answerCollection();
  const originalFetch = globalThis.fetch;
  let release!: () => void;
  const pending = new Promise<void>((done) => {
    release = done;
  });
  vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
    if (String(args[0]) === `/api/member-collections/${MEMBER}`) {
      await pending;
    }
    if (String(args[0]) === `/api/member-collections/${OTHER_MEMBER}`) {
      return Response.json({
        member: { ...identity, memberId: OTHER_MEMBER, displayName: "Elena" },
      });
    }
    return originalFetch(...args);
  });
  const { router } = renderTimeline(`/?member=${MEMBER}`);
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
  await act(async () => {
    await router.navigate({ to: "/", search: { member: OTHER_MEMBER } });
  });
  expect(await screen.findByRole("heading", { name: "Elena" })).toBeVisible();
  await act(async () => {
    release();
    await pending;
  });
  expect(
    screen.queryByRole("heading", { name: "Jorge" }),
  ).not.toBeInTheDocument();
});

it("keeps the collection when Find adds an extra filter, then clears only extras", async () => {
  respondWith({
    [`GET /api/member-collections/${MEMBER}`]: {
      status: 200,
      body: { member: identity },
    },
    "GET /api/timeline": { status: 200, body: emptyPage },
    "GET /api/timeline/rail": {
      status: 200,
      body: { days: [], nextCursor: null },
    },
    "GET /api/filters/facets": {
      status: 200,
      body: { tags: [], people: [], resultCount: 0 },
    },
  });
  const { router } = renderTimeline(`/?member=${MEMBER}`);
  await screen.findByRole("heading", { name: "Jorge" });
  await act(async () => {
    fireEvent.click(screen.getByRole("link", { name: "Find" }));
  });
  await waitFor(() => {
    expect(router.state.location.search).toEqual({
      member: MEMBER,
      find: true,
    });
  });
  await act(async () => {
    await router.navigate({
      to: "/",
      search: { member: MEMBER, tag: [TAG], find: true },
    });
  });
  await screen.findByRole("button", { name: "Clear extra filters" });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Clear extra filters" }),
    );
  });
  await waitFor(() => {
    expect(router.state.location.search).toEqual({
      member: MEMBER,
      find: true,
    });
  });
});
