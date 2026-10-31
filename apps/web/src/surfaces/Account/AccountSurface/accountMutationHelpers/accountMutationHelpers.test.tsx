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
  "retires the held %s PATCH after its hook unmounts and the cache clears",
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
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(writes).toEqual([
      field === "name"
        ? { displayName: "Saved name" }
        : { notify: savedAccount.me.notify },
    ]);
    client.clear();
  },
);

it("does not publish an old name save into a different current account", async () => {
  const original = createMeResponse({ displayName: "Original" });
  const other = createMeResponse({
    avatar: null,
    memberId: "018f0000-0000-7000-8000-000000000001",
    displayName: "Other",
  });
  const client = new QueryClient();
  client.setQueryData(["me"], original);
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return pending.promise;
    }),
  );
  const hook = renderHook(
    () => {
      return useSaveMe();
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
  act(() => {
    return hook.result.current.save({ displayName: "Saved original" });
  });
  await vi.waitFor(() => {
    return expect(fetch).toHaveBeenCalled();
  });
  client.setQueryData(["me"], other);
  await act(async () => {
    pending.resolve(
      Response.json(createMeResponse({ displayName: "Saved original" })),
    );
    await pending.promise;
  });
  await vi.waitFor(() => {
    return expect(hook.result.current.isSaving).toBe(false);
  });
  expect(client.getQueryData(["me"])).toEqual(other);
});

it("does not roll back a newer avatar when a held name response arrives", async () => {
  const original = createMeResponse({ displayName: "Original" });
  const avatar = {
    avatarId: "018f0000-0000-7000-8000-000000000010",
    url: "https://example.com/new",
    issuedAt: "2026-10-31T00:00:00.000Z",
    expiresAt: "2099-10-31T01:00:00.000Z",
  };
  const client = new QueryClient();
  client.setQueryData(["me"], original);
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return pending.promise;
    }),
  );
  const hook = renderHook(
    () => {
      return useSaveMe();
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
  act(() => {
    return hook.result.current.save({ displayName: "New" });
  });
  await vi.waitFor(() => {
    return expect(fetch).toHaveBeenCalled();
  });
  client.setQueryData(["me"], createMeResponse({ avatar }));
  await act(async () => {
    pending.resolve(Response.json(createMeResponse({ displayName: "New" })));
    await pending.promise;
  });
  await vi.waitFor(() => {
    return expect(hook.result.current.isSaving).toBe(false);
  });
  expect(
    client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me.member,
  ).toMatchObject({ displayName: "New", avatar });
});
