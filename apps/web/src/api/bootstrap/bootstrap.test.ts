import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { bootstrapQueryOptions } from "./bootstrap";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reads current authority on every fetch and never substitutes cached success on failure", async () => {
  const client = new QueryClient();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        setup: { isRequired: true },
        account: null,
        progress: null,
      }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: "unavailable", message: "Unavailable" },
        { status: 503 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await client.fetchQuery(bootstrapQueryOptions)).toEqual({
    setup: { isRequired: true },
    account: null,
    progress: null,
  });
  await expect(client.fetchQuery(bootstrapQueryOptions)).rejects.toMatchObject({
    status: 503,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/bootstrap");
});

it("does not refresh navigation authority on focus or reconnect", async () => {
  const client = new QueryClient();
  const fetcher = vi.fn().mockImplementation(() => {
    return Promise.resolve(
      Response.json({
        setup: { isRequired: true },
        account: null,
        progress: null,
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  await client.fetchQuery(bootstrapQueryOptions);
  const observer = new QueryObserver(client, {
    ...bootstrapQueryOptions,
    refetchOnMount: false,
  });
  const stop = observer.subscribe(() => {});
  client.getQueryCache().onFocus();
  client.getQueryCache().onOnline();
  expect(fetcher).toHaveBeenCalledTimes(1);
  stop();
  client.clear();
});
