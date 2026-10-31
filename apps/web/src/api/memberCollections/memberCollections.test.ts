import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import { removePrivateQueries } from "@/api/me/privateQueryHelpers";
import {
  makeMemberCollectionHrefFromMemberId,
  makeMemberCollectionQueryOptionsFromIds,
} from "./memberCollections";
import { makeTimelineQueryOptionsFromView } from "@/api/timelineHelpers/timelineHelpers";
import { getNavigationSelectionFromView } from "@/media/getNavigationSelectionFromView";
import { makeDay } from "@/surfaces/Timeline/timelineFixtureHelpers";

const MEMBER = "018f0000-0000-7000-8000-000000000021";
const OTHER_MEMBER = "018f0000-0000-7000-8000-000000000022";
const PAGE = {
  days: [makeDay()],
  nextCursor: null,
  previousCursor: null,
  resultCount: 3,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it("makes a clean encoded member address without inherited filters", () => {
  expect(makeMemberCollectionHrefFromMemberId(MEMBER)).toBe(
    `/?member=${MEMBER}`,
  );
  expect(makeMemberCollectionHrefFromMemberId("a&tag=old")).toBe(
    "/?member=a%26tag%3Dold",
  );
});

it("carries the member through canonical media navigation and the effective jump", () => {
  expect(
    getNavigationSelectionFromView({
      selection: {
        tags: ["z", "a", "a"],
        people: [],
        member: MEMBER,
        until: "2026-10-31",
      },
      at: "2026-10-01",
    }),
  ).toEqual({
    tags: ["a", "z"],
    people: [],
    member: MEMBER,
    until: "2026-10-01",
  });
});

it("never publishes an old member page into the new collection during a held read", async () => {
  const client = new QueryClient();
  const makeOptions = (member: string) => {
    return makeTimelineQueryOptionsFromView({
      memberId: "reader",
      view: { selection: { tags: [], people: [], member }, at: undefined },
    });
  };
  const oldOptions = makeOptions(MEMBER);
  const newOptions = makeOptions(OTHER_MEMBER);
  let release!: (response: Response) => void;
  const held = new Promise<Response>((done) => {
    release = done;
  });
  vi.stubGlobal("fetch", (url: string) => {
    return url.includes(MEMBER)
      ? held
      : Promise.resolve(
          Response.json({
            ...PAGE,
            days: [makeDay({ capturedOn: "2026-10-30" })],
          }),
        );
  });
  const observer = new InfiniteQueryObserver(client, oldOptions);
  const unsubscribe = observer.subscribe(() => {});
  try {
    await vi.waitFor(() => {
      expect(client.getQueryState(oldOptions.queryKey)?.fetchStatus).toBe(
        "fetching",
      );
    });
    observer.setOptions(newOptions);
    await observer.refetch();
    expect(
      observer.getCurrentResult().data?.pages[0]?.days[0]?.capturedOn,
    ).toBe("2026-10-30");
    release(Response.json(PAGE));
    await held;
    await new Promise<void>((done) => {
      setTimeout(done, 0);
    });
    expect(
      client.getQueryData(newOptions.queryKey)?.pages[0]?.days[0]?.capturedOn,
    ).toBe("2026-10-30");
    expect(oldOptions.queryKey).not.toEqual(newOptions.queryKey);
  } finally {
    unsubscribe();
    observer.destroy();
    client.clear();
  }
});

it("retires all in-flight collection identity and pages with private authority", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const account = createMeResponse();
  client.setQueryData(["me"], account);
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  vi.stubGlobal("fetch", async (url: string) => {
    await held;
    return Response.json(
      url.includes("member-collections")
        ? {
            member: { memberId: MEMBER, displayName: "Old name", avatar: null },
          }
        : PAGE,
    );
  });
  const identityOptions = makeMemberCollectionQueryOptionsFromIds({
    memberId: MEMBER,
    readerId: account.me.member.memberId,
  });
  const pageOptions = makeTimelineQueryOptionsFromView({
    memberId: account.me.member.memberId,
    view: {
      selection: { tags: [], people: [], member: MEMBER },
      at: undefined,
    },
  });
  const identityRead = client.fetchQuery(identityOptions).catch(() => {
    return undefined;
  });
  const pageRead = client.fetchInfiniteQuery(pageOptions).catch(() => {
    return undefined;
  });
  removePrivateQueries(client);
  client.setQueryData(["me"], createMeResponse({ role: "viewer" }));
  release();
  await Promise.all([identityRead, pageRead]);
  expect(client.getQueryData(identityOptions.queryKey)).toBeUndefined();
  expect(client.getQueryData(pageOptions.queryKey)).toBeUndefined();
  client.clear();
});
