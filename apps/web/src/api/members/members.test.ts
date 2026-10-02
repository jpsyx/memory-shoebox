import type { skipToken } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { membersQueryOptions } from "@/api/members/members";

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
  const options = membersQueryOptions();
  const queryFn = options.queryFn as Exclude<
    typeof options.queryFn,
    typeof skipToken | undefined
  >;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAPA = {
  memberId: "018f0000-0000-7000-8000-000000000000",
  displayName: "Papá",
};

describe("membersQueryOptions", () => {
  it("reads the directory shape an uploader gets", async () => {
    _answerWith({ shape: "directory", members: [PAPA], nextCursor: null });

    await expect(_callQueryFn()).resolves.toEqual({
      shape: "directory",
      members: [PAPA],
      nextCursor: null,
    });
  });

  it("reads an admin's rows down to what the picker needs", async () => {
    _answerWith({
      shape: "admin",
      members: [
        {
          ...PAPA,
          email: "papa@example.com",
          role: "admin",
          status: "active",
          sessions: [],
          invitation: null,
        },
      ],
      nextCursor: null,
      activeAdminCount: 1,
    });

    await expect(_callQueryFn()).resolves.toEqual({
      shape: "admin",
      members: [{ ...PAPA, role: "admin" }],
      nextCursor: null,
    });
  });
});
