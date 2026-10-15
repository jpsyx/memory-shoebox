import { getBootstrapGenerationFromClient } from "@/api/bootstrap/bootstrap";
import { createMeResponse } from "@/testing/createMeResponse";
import { CancelledError, QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { ensureAccountReadProtection } from "./ensureAccountReadProtection";

function _makeDeferredWrite() {
  let complete: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}

it("fences each exact account publication once without requiring a cached pending write", () => {
  const client = new QueryClient();
  const account = createMeResponse();
  client.setQueryData(["me"], account);
  ensureAccountReadProtection(client);
  ensureAccountReadProtection(client);
  const generation = getBootstrapGenerationFromClient(client);
  client.setQueryData(["me", "sessions"], { sessions: [] });
  expect(getBootstrapGenerationFromClient(client)).toBe(generation);
  client.setQueryData(["me"], account);
  expect(getBootstrapGenerationFromClient(client)).toBe(generation + 1);
  client.clear();
  client.setQueryData(["me"], account);
  expect(getBootstrapGenerationFromClient(client)).toBe(generation + 2);
  client.clear();
});

it.each(["context", "undefined", "continue"])(
  "fences a removed queued write's publication after %s without changing its queue lifecycle",
  async (preparationResult) => {
    const client = new QueryClient();
    const account = createMeResponse();
    const saved = createMeResponse({ displayName: "Saved name" });
    client.setQueryData(["me"], account);
    ensureAccountReadProtection(client);
    const firstGate = _makeDeferredWrite();
    const preparationGate = _makeDeferredWrite();
    const queuedGate = _makeDeferredWrite();
    const bootstrapGate = _makeDeferredWrite();
    const firstWrite = vi.fn(() => {
      return firstGate.promise;
    });
    const queuedWrite = vi.fn(() => {
      return queuedGate.promise;
    });
    const first = client.getMutationCache().build(client, {
      scope: { id: "me" },
      mutationFn: firstWrite,
    });
    const queued = client.getMutationCache().build(client, {
      scope: { id: "me" },
      mutationFn: queuedWrite,
      onMutate: async () => {
        if (preparationResult !== "continue") {
          await preparationGate.promise;
        }
        return preparationResult === "context" ? { prepared: true } : undefined;
      },
      onSuccess: () => {
        client.setQueryData(["me"], saved);
      },
    });
    const savingFirst = first.execute(undefined);
    const savingQueued = queued.execute(undefined);
    await vi.waitFor(() => {
      expect(firstWrite).toHaveBeenCalledTimes(1);
    });
    expect(queued.state.isPaused).toBe(true);
    expect(queuedWrite).not.toHaveBeenCalled();
    client.clear();
    firstGate.complete();
    await savingFirst;
    expect(client.isMutating()).toBe(0);
    expect(queuedWrite).not.toHaveBeenCalled();
    const staleRead = client
      .fetchQuery({
        queryKey: ["bootstrap"],
        queryFn: async () => {
          await bootstrapGate.promise;
          return account;
        },
      })
      .catch((error: unknown) => {
        return error;
      });
    if (preparationResult === "continue") {
      void queued.continue();
    } else {
      preparationGate.complete();
    }
    await vi.waitFor(() => {
      expect(queuedWrite).toHaveBeenCalledTimes(1);
    });
    const beforePublication = getBootstrapGenerationFromClient(client);
    queuedGate.complete();
    await savingQueued;
    bootstrapGate.complete();
    expect(await staleRead).toBeInstanceOf(CancelledError);
    expect(getBootstrapGenerationFromClient(client)).toBe(
      beforePublication + 1,
    );
    expect(client.getQueryData(["me"])).toEqual(saved);
    expect(client.isMutating()).toBe(0);
    expect(firstWrite).toHaveBeenCalledTimes(1);
    expect(queuedWrite).toHaveBeenCalledTimes(1);
    client.clear();
  },
);
