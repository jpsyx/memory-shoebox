import { startSettingsSynchronization } from "@/surfaces/Settings/settingsSynchronizationHelpers/settingsSynchronizationHelpers";

import { createMeResponse } from "@/testing/createMeResponse";

import { createCachedAdminQueryClient } from "@/testing/setupNavigationTestHelpers";

import { CancelledError } from "@tanstack/react-query";

import { expect, it, vi } from "vitest";

import {
  bootstrap,
  installRootTestLifecycle,
  makeRootRouterFromOptions,
} from "./__rootTestHelpers";
installRootTestLifecycle();

it.each(["settings-recovery", "group-continuation"])(
  "%s survives transient read failure without granting cached authority",
  async (key) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData([key], {
      hasCommitted: true,
      message: "Saved",
      isRefreshing: false,
    });
    const { router } = makeRootRouterFromOptions({
      path: "/people",
      client,
      answer: () => {
        return {
          body: { error: "unavailable", message: "Unavailable" },
          status: 503,
        };
      },
    });
    await router.load();
    expect(router.state.matches[0]?.status).toBe("error");
    expect(client.getQueryData([key])).toMatchObject({ hasCommitted: true });
  },
);

it("late private reads cannot restore retired data after current authority loss", async () => {
  const client = createCachedAdminQueryClient();
  let finishRead: (value: { private: boolean }) => void = () => {};
  const pending = new Promise<{ private: boolean }>((settle) => {
    finishRead = settle;
  });
  const read = client
    .fetchQuery({
      queryKey: ["items", "private"],
      queryFn: () => {
        return pending;
      },
    })
    .catch(() => {
      return undefined;
    });
  const { router } = makeRootRouterFromOptions({
    path: "/sign-in",
    client,
    answer: () => {
      return bootstrap({ account: null });
    },
  });
  await router.load();
  finishRead({ private: true });
  await read;
  expect(client.getQueryData(["items", "private"])).toBeUndefined();
  expect(client.getQueryData(["me"])).toBeNull();
});

it.each(["before", "during", "reconciliation", "publication"])(
  "cancels a navigation read started %s a serialized write before stale publication",
  async (timing) => {
    const client = createCachedAdminQueryClient();
    client.setQueryData(["settings", "admin"], {});
    const { router } = makeRootRouterFromOptions({
      path: "/people",
      client,
      answer: () => {
        return bootstrap();
      },
    });
    const stop = startSettingsSynchronization({
      queryClient: client,
      invalidateRouter: async () => {},
    });
    let releaseRead: (response: Response) => void = () => {};
    const deferredRead = new Promise<Response>((settle) => {
      releaseRead = settle;
    });
    let readCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        return ++readCount === 1
          ? deferredRead
          : Promise.resolve(Response.json(bootstrap({ account: saved }).body));
      }),
    );
    let finishSave: () => void = () => {};
    const pendingSave = new Promise<void>((settle) => {
      finishSave = settle;
    });
    const saved = createMeResponse({ displayName: "Saved name" });
    const save = vi.fn(() => {
      return pendingSave;
    });
    const mutation = client.getMutationCache().build(client, {
      scope: { id: "me" },
      mutationFn: save,
      onSuccess: async () => {
        client.setQueryData(["me"], saved);
        if (timing === "reconciliation") {
          await router.invalidate();
        }
      },
    });
    const saving =
      timing !== "before" ? mutation.execute(undefined) : undefined;
    const loading = router.load();
    await vi.waitFor(() => {
      return expect(fetch).toHaveBeenCalled();
    });
    const laterSave =
      timing === "before" ? mutation.execute(undefined) : undefined;
    if (timing === "publication") {
      const stopPublication = client.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.action.type === "success" &&
          event.query.queryKey[0] === "bootstrap"
        ) {
          finishSave();
        }
      });
      releaseRead(Response.json(bootstrap().body));
      await saving;
      stopPublication();
    } else {
      finishSave();
      await (saving ?? laterSave);
      releaseRead(Response.json(bootstrap().body));
    }
    await loading;
    expect(client.getQueryData(["me"])).toEqual(saved);
    expect(router.state.matches[0]?.status).toBe(
      timing === "reconciliation" ? "success" : "error",
    );
    if (timing !== "reconciliation") {
      expect(router.state.matches[0]?.error).toBeInstanceOf(CancelledError);
      await router.invalidate();
      expect(router.state.matches[0]?.status).toBe("success");
      expect(client.getQueryData(["me"])).toEqual(saved);
    }
    expect(save).toHaveBeenCalledTimes(1);
    stop();
    client.clear();
  },
);
