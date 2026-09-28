import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meQueryOptions, revokeMySession, updateMe } from "@/api/me";

const ME_BODY = {
  me: {
    member: {
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Abuela",
    },
    storedDisplayName: null,
    email: "abuela@example.com",
    role: "admin",
    notify: { onUpload: true, onComment: true, onReply: true, onRemoval: true },
    joinedAt: "2026-09-28T10:00:00.000Z",
    lastSignedInAt: "2026-09-28T10:00:00.000Z",
  },
  settings: {
    shoeboxName: "My Shoebox",
    pileArrangement: "messy",
    timezone: "Europe/Madrid",
  },
};

function _respondWith(body: unknown, status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(status === 204 ? null : JSON.stringify(body), {
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
 * Calls `meQueryOptions.queryFn` the way the route guard's `beforeLoad` does:
 * with no real `QueryFunctionContext`.
 *
 * The installed TanStack Query types (5.103) type `queryFn` as optional and
 * require a context argument, even though this query function ignores its
 * context entirely, so calling it with no argument at all does not type-check.
 * `NonNullable` and a cast are the two type-only corrections that make the
 * call match the query function actually written, without touching anything
 * that runs.
 */
function _callMeQueryFn(): ReturnType<
  NonNullable<typeof meQueryOptions.queryFn>
> {
  const queryFn = meQueryOptions.queryFn as NonNullable<
    typeof meQueryOptions.queryFn
  >;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

describe("meQueryOptions", () => {
  it("resolves the account when somebody is signed in", async () => {
    _respondWith(ME_BODY, 200);

    await expect(_callMeQueryFn()).resolves.toMatchObject({
      me: { email: "abuela@example.com" },
    });
  });

  it("resolves undefined on a 401 rather than throwing, so the guard can redirect", async () => {
    _respondWith({ error: "not_signed_in", message: "No live session." }, 401);

    await expect(_callMeQueryFn()).resolves.toBeUndefined();
  });

  it("still throws on any other failure, which is not an answer", async () => {
    _respondWith({ error: "internal_error", message: "Boom." }, 500);

    await expect(_callMeQueryFn()).rejects.toThrow();
  });
});

describe("updateMe", () => {
  it("patches only what it was given", async () => {
    _respondWith(ME_BODY, 200);

    await updateMe({ displayName: "Abuela Rosa" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ displayName: "Abuela Rosa" }),
      }),
    );
  });
});

describe("revokeMySession", () => {
  it("deletes the device by its own id", async () => {
    _respondWith(undefined, 204);

    await revokeMySession("018f0000-0000-7000-8000-000000000001");

    expect(fetch).toHaveBeenCalledWith(
      "/api/me/sessions/018f0000-0000-7000-8000-000000000001",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
