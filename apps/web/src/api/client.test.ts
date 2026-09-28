import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiFetch } from "@/api/client";

const schema = z.object({ status: z.string() });

/** One canned response, so a test states only what it is about. */
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

describe("apiFetch", () => {
  it("parses a 2xx body with the schema it was given", async () => {
    _respondWith({ status: "ok" }, 200);

    await expect(apiFetch({ path: "/health", schema })).resolves.toEqual({
      status: "ok",
    });
  });

  it("calls /api on this origin, with the session cookie", async () => {
    _respondWith({ status: "ok" }, 200);
    await apiFetch({ path: "/health", schema });

    expect(fetch).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("surfaces a 404 envelope as a typed failure", async () => {
    _respondWith({ error: "item_not_found", message: "No such item." }, 404);

    const failure = await apiFetch({ path: "/items/x", schema }).catch(
      (error: unknown) => {
        return error;
      },
    );

    expect(failure).toBeInstanceOf(ApiRequestError);
    expect(failure).toMatchObject({
      status: 404,
      code: "item_not_found",
      details: undefined,
    });
  });

  it("keeps retryAfterSeconds off a 429", async () => {
    _respondWith(
      {
        error: "rate_limited",
        message: "Too many.",
        details: { retryAfterSeconds: 42 },
      },
      429,
    );

    const failure = (await apiFetch({ path: "/auth/session", schema }).catch(
      (error: unknown) => {
        return error;
      },
    )) as ApiRequestError;

    expect(failure.status).toBe(429);
    expect(failure.code).toBe("rate_limited");
    expect(failure.details?.retryAfterSeconds).toBe(42);
  });

  it("keeps fieldErrors off a 400", async () => {
    _respondWith(
      {
        error: "invalid_request",
        message: "Bad.",
        details: { fieldErrors: { email: ["Not an address"] } },
      },
      400,
    );

    const failure = (await apiFetch({ path: "/me", schema }).catch(
      (error: unknown) => {
        return error;
      },
    )) as ApiRequestError;

    expect(failure.details?.fieldErrors).toEqual({
      email: ["Not an address"],
    });
  });

  it("still fails typed when the body is not an envelope at all", async () => {
    _respondWith("<html>502</html>", 502);

    const failure = (await apiFetch({ path: "/health", schema }).catch(
      (error: unknown) => {
        return error;
      },
    )) as ApiRequestError;

    expect(failure).toBeInstanceOf(ApiRequestError);
    expect(failure.code).toBe("unknown_error");
    expect(failure.status).toBe(502);
  });

  it("throws at the boundary when a 2xx body fails its schema", async () => {
    _respondWith({ unexpected: true }, 200);

    await expect(apiFetch({ path: "/health", schema })).rejects.toThrow();
  });
});
