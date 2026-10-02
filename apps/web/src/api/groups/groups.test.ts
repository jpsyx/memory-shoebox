import type { skipToken } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { groupsQueryOptions } from "@/api/groups/groups";

/** Answers every request with one body. */
function _answerWith(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/**
 * Calls the query function with no context, which this one never reads.
 *
 * `queryFn` is typed as optional and as possibly `skipToken`; neither is true
 * of this query, so both are cast away.
 */
function _callQueryFn() {
  const options = groupsQueryOptions();
  const queryFn = options.queryFn as Exclude<
    typeof options.queryFn,
    typeof skipToken | undefined
  >;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const GRANDPARENTS = {
  groupId: "018f0000-0000-7000-8000-0000000a0001",
  name: "The grandparents",
};

describe("groupsQueryOptions", () => {
  it("reads the picker shape an uploader gets", async () => {
    _answerWith({ shape: "picker", groups: [GRANDPARENTS], nextCursor: null });

    await expect(_callQueryFn()).resolves.toEqual({
      shape: "picker",
      groups: [GRANDPARENTS],
      nextCursor: null,
    });
  });

  it("keeps an admin's member list, which says how many a group holds", async () => {
    const papa = {
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Papá",
    };
    _answerWith({
      shape: "admin",
      groups: [
        {
          ...GRANDPARENTS,
          createdAt: "2026-09-01T10:00:00.000Z",
          members: [papa],
          usedByOnlyRules: 9,
          usedByExceptRules: 0,
        },
      ],
      nextCursor: null,
    });

    await expect(_callQueryFn()).resolves.toEqual({
      shape: "admin",
      groups: [{ ...GRANDPARENTS, members: [papa] }],
      nextCursor: null,
    });
  });
});
