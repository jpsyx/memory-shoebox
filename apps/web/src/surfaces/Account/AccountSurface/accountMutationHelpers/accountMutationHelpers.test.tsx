import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import { useSaveMe, useSaveNotify } from "./accountMutationHelpers";
import { AccountMutationFixture } from "./AccountMutationFixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each(["name", "notify"] as const)(
  "publishes the held %s PATCH once after its hook unmounts and the cache clears",
  async (field) => {
    const oldAccount = createMeResponse({
      displayName: "Old name",
      role: "viewer",
    });
    const savedAccount =
      field === "name"
        ? createMeResponse({ displayName: "Saved name", role: "viewer" })
        : {
            ...oldAccount,
            me: {
              ...oldAccount.me,
              notify: { ...oldAccount.me.notify, onUpload: false },
            },
          };
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    client.setQueryData(["me"], oldAccount);
    const pending = Promise.withResolvers<Response>();
    const writes: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, init?: RequestInit) => {
        expect(path).toBe("/api/me");
        expect(init?.method).toBe("PATCH");
        writes.push(JSON.parse(String(init?.body)));
        return pending.promise;
      }),
    );
    const hook = renderHook(
      () => {
        return { name: useSaveMe(), notify: useSaveNotify() };
      },
      {
        wrapper: ({ children }) => {
          return (
            <AccountMutationFixture client={client}>
              {children}
            </AccountMutationFixture>
          );
        },
      },
    );
    await act(async () => {
      if (field === "name") {
        hook.result.current.name.save({ displayName: "Saved name" });
      } else {
        hook.result.current.notify.save(savedAccount.me.notify);
      }
      await vi.waitFor(() => {
        expect(writes).toHaveLength(1);
      });
    });
    const mutation = client
      .getMutationCache()
      .getAll()
      .find((entry) => {
        return entry.state.status === "pending";
      })!;
    act(() => {
      client.clear();
      hook.unmount();
    });
    expect(mutation.state.status).toBe("pending");
    expect(client.isMutating()).toBe(0);
    expect(client.getQueryData(["me"])).toBeUndefined();
    await act(async () => {
      pending.resolve(Response.json(savedAccount));
      await vi.waitFor(() => {
        expect(mutation.state.status).toBe("success");
      });
    });
    expect(client.getQueryData(["me"])).toEqual(savedAccount);
    expect(writes).toEqual([
      field === "name"
        ? { displayName: "Saved name" }
        : { notify: savedAccount.me.notify },
    ]);
    client.clear();
  },
);
