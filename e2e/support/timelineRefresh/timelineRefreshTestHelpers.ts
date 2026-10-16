import { expect, vi } from "vitest";
import { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../../apps/server/test/helpers/createTestConfig.ts";
import { insertSignedInMember } from "../../../apps/server/test/helpers/insertSignedInMember.ts";
import { insertDrawableItem } from "../../../apps/server/test/routes/timelineContractTestHelpers.ts";
import {
  insertItemTag,
  insertMember,
  insertTag,
  insertVisibilityRule,
  NOW,
} from "../../../apps/server/test/helpers/seedHelpers/seedHelpers.ts";
import {
  readTimelineAdapterFromBundle,
  makeTimelineIntegrationClient,
  makeTimelineObserverFromOptions,
  type TimelineIntegrationPage,
} from "../../../apps/web/src/testing/timelineAdapter/timelineAdapterHelpers.ts";
type TimelineItemInserterOptions = {
  fixture: TestApp;
  uploader: string;
  tagId: string;
  hiddenRule: string;
};

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
type ResponseHold = (path: string, response: Response) => Promise<Response>;
type TimelineRequest = {
  path: string;
  startedAt: number;
  page: TimelineIntegrationPage;
  signal: AbortSignal | undefined;
};
type TimelineSeed = {
  memberId: string;
  cookie: string;
  tagId: string;
  hiddenRule: string;
  itemIds: string[];
  insert: ReturnType<typeof _makeItemInserterFromSeed>;
};
type TimelineHarness = TimelineSeed &
  ReturnType<typeof _installTimelineTransport> & {
    fixture: TestApp;
    client: ReturnType<typeof makeTimelineIntegrationClient>;
    observer: ReturnType<typeof makeTimelineObserverFromOptions>;
    options: Parameters<
      typeof makeTimelineObserverFromOptions
    >[0]["queryOptions"];
    close: () => Promise<void>;
  };

function _makeItemInserterFromSeed(
  options: Readonly<TimelineItemInserterOptions>,
): ({
  day,
  flags,
}: Readonly<{
  day: number;
  flags?: { isHidden?: boolean; isTagged?: boolean };
}>) => Promise<string> {
  return async ({ day, flags = {} }) => {
    const itemId = await insertDrawableItem(options.fixture.database, {
      uploadedBy: options.uploader,
      seq: day,
      capturedOn: `2026-09-${day}`,
      ...(flags.isHidden ? { visibilityRuleId: options.hiddenRule } : {}),
    });
    if (flags.isTagged !== false) {
      await insertItemTag(options.fixture.database, {
        itemId,
        tagId: options.tagId,
      });
    }
    return itemId;
  };
}

async function _seedTimelineFixture(fixture: TestApp): Promise<TimelineSeed> {
  const { memberId, cookie } = await insertSignedInMember({
    database: fixture.database,
  });
  const uploader = await insertMember(fixture.database);
  const tagId = await insertTag(fixture.database, { name: "Selected" });
  const hiddenRule = await insertVisibilityRule(fixture.database, {
    mode: "only",
  });
  const insert = _makeItemInserterFromSeed({
    fixture,
    uploader,
    tagId,
    hiddenRule,
  });
  const itemIds: string[] = [];
  for (let day = 27; day >= 21; day -= 1) {
    itemIds.push(await insert({ day: day }));
  }
  await insert({ day: 29, flags: { isTagged: false } });
  await insert({ day: 30, flags: { isHidden: true } });
  const outside = await insertDrawableItem(fixture.database, {
    uploadedBy: uploader,
    seq: 100,
    capturedOn: "2026-10-01",
  });
  await insertItemTag(fixture.database, { itemId: outside, tagId });
  return { memberId, cookie, tagId, hiddenRule, itemIds, insert };
}

function _installTimelineTransport(
  options: Readonly<{ fixture: TestApp; seed: TimelineSeed }>,
): {
  requests: TimelineRequest[];
  hold: (callback: ResponseHold | undefined) => void;
} {
  const requests: TimelineRequest[] = [];
  let clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => {
    return clock;
  });
  let holdResponse: ResponseHold | undefined;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit = {}) => {
    const url = new URL(path, "http://localhost");
    expect(url.searchParams.get("until")).toBe("2026-09-30");
    expect(url.searchParams.getAll("tags")).toEqual([options.seed.tagId]);
    // Page size is outside selection identity; keep this fixture compact.
    url.searchParams.set("limit", "1");
    const startedAt = clock;
    const response = await options.fixture.app.inject({
      method: "GET",
      url: `${url.pathname}${url.search}`,
      headers: { cookie: options.seed.cookie },
    });
    expect(response.statusCode).toBe(200);
    requests.push({
      path,
      startedAt,
      page: response.json(),
      signal: init.signal ?? undefined,
    });
    clock += 100;
    const result = Response.json(response.json());
    return holdResponse === undefined ? result : holdResponse(path, result);
  });
  return {
    requests,
    hold: (callback): void => {
      holdResponse = callback;
    },
  };
}

/**
 * Real in-memory server and production query adapter with a bounded fixture.
 */
export async function makeTimelineRefreshHarness(
  adapter: Awaited<ReturnType<typeof readTimelineAdapterFromBundle>>,
): Promise<TimelineHarness> {
  const fixture = await createTestApp({
    config: createTestConfig({
      NODE_ENV: "development",
      ENABLE_FAKE_EMAIL: "true",
    }),
    clock: () => {
      return new Date(NOW);
    },
  });
  const seed = await _seedTimelineFixture(fixture);
  const transport = _installTimelineTransport({ fixture, seed });
  const client = makeTimelineIntegrationClient();
  const options = adapter.makeTimelineQueryOptionsFromView({
    memberId: seed.memberId,
    view: {
      selection: { tags: [seed.tagId], people: [], until: "2026-10-01" },
      at: "2026-09-30",
    },
  });
  const observer = makeTimelineObserverFromOptions({
    client,
    queryOptions: options,
  });
  return {
    fixture,
    client,
    observer,
    options,
    ...seed,
    ...transport,
    close: async (): Promise<void> => {
      observer.destroy();
      client.clear();
      await fixture.close();
    },
  };
}

/** Evicts early pages, then restores the newest retained window in reverse. */
export async function restoreNewestTimelinePages(
  harness: Readonly<TimelineHarness>,
): Promise<void> {
  await harness.observer.refetch();
  for (let index = 0; index < 6; index += 1) {
    await harness.observer.fetchNextPage();
  }
  await harness.observer.fetchPreviousPage();
  await harness.observer.fetchPreviousPage();
  expect(
    harness.observer.getCurrentResult().data!.pages.map((page) => {
      return page.days[0]!.capturedOn;
    }),
  ).toEqual([
    "2026-09-27",
    "2026-09-26",
    "2026-09-25",
    "2026-09-24",
    "2026-09-23",
  ]);
}
