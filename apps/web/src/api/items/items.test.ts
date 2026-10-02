import type { skipToken } from "@tanstack/react-query";
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

afterEach(() => {
  vi.unstubAllGlobals();
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
