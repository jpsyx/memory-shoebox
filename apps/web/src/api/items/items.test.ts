import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryObserver,
  type skipToken,
} from "@tanstack/react-query";
import { ZodError } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteItem,
  itemQueryOptions,
  makeOriginalHrefFromItemId,
  setItemAltText,
  setItemCaptureDate,
  setItemPeople,
  setItemTags,
  setItemVisibility,
} from "@/api/items/items";
import { queryClient } from "@/queryClient";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtures";

/** One request as the server saw it. */
type Call = { url: string; method: string; body: unknown };

const calls: Call[] = [];

/** Answers every request with one body, and records what was asked. */
function _answerWith(body: unknown, status = 200): void {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/**
 * Calls a query function with no context, which this one never reads.
 *
 * `queryFn` is typed as optional and as possibly `skipToken`; neither is true
 * of this query, so both are cast away.
 */
function _callQueryFn(options: ReturnType<typeof itemQueryOptions>) {
  const queryFn = options.queryFn as Exclude<
    typeof options.queryFn,
    typeof skipToken | undefined
  >;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

/** Clients a test mounted, so the next test starts with none listening. */
const mountedClients: QueryClient[] = [];

/**
 * A client with the app's real defaults, listening to focus and reconnect.
 *
 * `retryDelay` is the one change: the real one waits a second before a retry,
 * and a test has nothing to wait for.
 */
function _mountAppClient(): QueryClient {
  const defaults = queryClient.getDefaultOptions();
  const client = new QueryClient({
    defaultOptions: {
      ...defaults,
      queries: { ...defaults.queries, retryDelay: 0 },
    },
  });
  client.mount();
  mountedClients.push(client);
  return client;
}

/** Lets anything a focus or reconnect event started reach the server. */
function _settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  mountedClients.splice(0).forEach((client) => {
    client.unmount();
    client.clear();
  });
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

describe("itemQueryOptions", () => {
  it("asks for the permalink and parses it", async () => {
    _answerWith(makeItemDetail());

    await expect(
      _callQueryFn(itemQueryOptions(ITEM_ID)),
    ).resolves.toMatchObject({ itemId: ITEM_ID });
    expect(calls).toEqual([
      { url: `/api/items/${ITEM_ID}`, method: "GET", body: undefined },
    ]);
  });
});

describe("itemQueryOptions, as the app's client runs it", () => {
  const permalink = { url: `/api/items/${ITEM_ID}`, method: "GET" };

  it("counts each arrival as an open, and nothing else", async () => {
    _answerWith(makeItemDetail());
    const client = new QueryClient({
      defaultOptions: queryClient.getDefaultOptions(),
    });
    client.mount();
    mountedClients.push(client);

    const firstArrival = new QueryObserver(client, itemQueryOptions(ITEM_ID));
    const leaveFirst = firstArrival.subscribe(() => {});
    await vi.waitFor(() => {
      expect(firstArrival.getCurrentResult().isSuccess).toBe(true);
    });
    leaveFirst();

    // Arriving again is opening again, even inside the 30s default staleTime.
    const secondArrival = new QueryObserver(client, itemQueryOptions(ITEM_ID));
    const leaveSecond = secondArrival.subscribe(() => {});
    await vi.waitFor(() => {
      expect(calls).toHaveLength(2);
    });
    await vi.waitFor(() => {
      expect(secondArrival.getCurrentResult().isFetching).toBe(false);
    });

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await _settle();
    leaveSecond();

    expect(
      calls.map(({ url, method }) => {
        return { url, method };
      }),
    ).toEqual([permalink, permalink]);
  });

  it("never asks again for an answer the server gave and counted", async () => {
    _answerWith({ itemId: ITEM_ID });
    const client = _mountAppClient();

    await expect(
      client.fetchQuery(itemQueryOptions(ITEM_ID)),
    ).rejects.toBeInstanceOf(ZodError);
    await _settle();

    expect(calls).toHaveLength(1);
  });

  it("does not ask again after a refusal", async () => {
    _answerWith({ error: "item_not_found", message: "No such item" }, 404);
    const client = _mountAppClient();

    await expect(
      client.fetchQuery(itemQueryOptions(ITEM_ID)),
    ).rejects.toMatchObject({ status: 404 });
    await _settle();

    expect(calls).toHaveLength(1);
  });

  it("asks once more after a server fault, and no more", async () => {
    _answerWith({ error: "internal_error", message: "Broken" }, 500);
    const client = _mountAppClient();

    await expect(
      client.fetchQuery(itemQueryOptions(ITEM_ID)),
    ).rejects.toMatchObject({ status: 500 });
    await _settle();

    expect(calls).toHaveLength(2);
  });
});

describe("the item's writes", () => {
  it.each([
    [
      "the description",
      () => {
        return setItemAltText({ itemId: ITEM_ID, body: { altText: "Papá" } });
      },
      "PATCH",
      `/api/items/${ITEM_ID}`,
      { altText: "Papá" },
    ],
    [
      "the tags",
      () => {
        return setItemTags({ itemId: ITEM_ID, body: { tags: ["beach"] } });
      },
      "PUT",
      `/api/items/${ITEM_ID}/tags`,
      { tags: ["beach"] },
    ],
    [
      "the people",
      () => {
        return setItemPeople({
          itemId: ITEM_ID,
          body: { people: [{ displayName: "Sofía" }] },
        });
      },
      "PUT",
      `/api/items/${ITEM_ID}/people`,
      { people: [{ displayName: "Sofía" }] },
    ],
    [
      "the visibility",
      () => {
        return setItemVisibility({
          itemId: ITEM_ID,
          body: { visibilityRuleId: "visibility-rule-everyone" },
        });
      },
      "PATCH",
      `/api/items/${ITEM_ID}/visibility`,
      { visibilityRuleId: "visibility-rule-everyone" },
    ],
    [
      "the capture date",
      () => {
        return setItemCaptureDate({
          itemId: ITEM_ID,
          body: { capturedOn: "2026-09-15" },
        });
      },
      "POST",
      `/api/items/${ITEM_ID}/capture-date`,
      { capturedOn: "2026-09-15" },
    ],
  ])(
    "sends %s and answers with the whole item",
    async (_name, write, method, url, body) => {
      _answerWith(makeItemDetail());

      await expect(write()).resolves.toMatchObject({ itemId: ITEM_ID });
      expect(calls).toEqual([{ url, method, body }]);
    },
  );

  it("deletes with no body and reads the 204", async () => {
    _answerWith(undefined, 204);

    await expect(deleteItem(ITEM_ID)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { url: `/api/items/${ITEM_ID}`, method: "DELETE", body: undefined },
    ]);
  });

  it("points the download at the route that signs it", () => {
    expect(makeOriginalHrefFromItemId(ITEM_ID)).toBe(
      `/api/items/${ITEM_ID}/original`,
    );
  });
});
