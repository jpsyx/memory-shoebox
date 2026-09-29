import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicSettingsQueryOptions } from "@/api/publicSettings/publicSettings";

function _respondWith(body: unknown, status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Calls `publicSettingsQueryOptions.queryFn` the way TanStack Query does at
 * runtime: with no real `QueryFunctionContext`, since this query function
 * ignores its context entirely.
 *
 * The installed TanStack Query types (5.103) mark `queryFn` optional and
 * require a context argument, so `NonNullable` and a cast are the two
 * type-only corrections needed to call it with none, matching the same
 * pattern used for `meQueryOptions` in `me.test.ts`.
 */
function _callPublicSettingsQueryFn(): ReturnType<
  NonNullable<typeof publicSettingsQueryOptions.queryFn>
> {
  const queryFn = publicSettingsQueryOptions.queryFn as NonNullable<
    typeof publicSettingsQueryOptions.queryFn
  >;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

describe("publicSettingsQueryOptions", () => {
  it("reads the anonymous route and round-trips the parsed body", async () => {
    _respondWith(
      { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" },
      200,
    );

    const settings = await _callPublicSettingsQueryFn();

    expect(fetch).toHaveBeenCalledWith(
      "/api/public-settings",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(settings).toEqual({
      shoeboxName: "My Shoebox",
      baseUrl: "http://localhost:5173",
    });
  });
});
