import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createMeResponse } from "@/testing/createMeResponse";
import { meQueryOptions } from "@/api/me/me";
import { publicSettingsQueryOptions } from "@/api/publicSettings/publicSettings";
import { SETTINGS } from "../../SettingsSurface/__tests__/settingsFixtureHelpers";
import {
  startSettingsSynchronization,
  notifySettingsChanged,
} from "../settingsSynchronization";

class TestChannel {
  static channels = new Set<TestChannel>();
  static messages: unknown[] = [];
  onmessage?: (event: { data: unknown }) => void;
  constructor(readonly name: string) {
    TestChannel.channels.add(this);
  }
  postMessage(data: unknown) {
    TestChannel.messages.push(data);
    TestChannel.channels.forEach((channel) => {
      if (channel !== this && channel.name === this.name) {
        channel.onmessage?.({ data });
      }
    });
  }
  close() {
    TestChannel.channels.delete(this);
  }
}
const disposals: Array<() => void> = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => {
    return dispose();
  });
  TestChannel.channels.clear();
  TestChannel.messages = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function _start(role: "viewer" | "admin" = "viewer") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const original = createMeResponse({ role });
  client.setQueryData(meQueryOptions.queryKey, original);
  const invalidateRouter = vi.fn(async () => {});
  const stop = startSettingsSynchronization({
    queryClient: client,
    invalidateRouter,
  });
  disposals.push(stop, () => {
    return client.clear();
  });
  return { client, original, invalidateRouter, stop };
}

it("refreshes another client immediately using a notification with no private data", async () => {
  vi.stubGlobal("BroadcastChannel", TestChannel);
  const first = _start();
  const second = _start();
  const fresh = {
    ...first.original,
    settings: { ...first.original.settings, shoeboxName: "Fresh family" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json(fresh);
    }),
  );
  notifySettingsChanged();
  expect(TestChannel.messages).toEqual(["settings-changed"]);
  await expect
    .poll(() => {
      return second.client.getQueryData(meQueryOptions.queryKey)?.settings
        .shoeboxName;
    })
    .toBe("Fresh family");
  expect(
    first.client.getQueryData(meQueryOptions.queryKey)?.settings.shoeboxName,
  ).toBe("Fresh family");
});

it("polls at 30 seconds only while visible and cleans up polling and events", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("BroadcastChannel", undefined);
  const { client, original, stop } = _start();
  const fresh = {
    ...original,
    settings: { ...original.settings, timezone: "UTC" },
  };
  const fetcher = vi.fn(async () => {
    return Response.json(fresh);
  });
  vi.stubGlobal("fetch", fetcher);
  await vi.advanceTimersByTimeAsync(29999);
  expect(client.getQueryData(meQueryOptions.queryKey)?.settings.timezone).toBe(
    "Europe/Madrid",
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(client.getQueryData(meQueryOptions.queryKey)?.settings.timezone).toBe(
    "UTC",
  );
  stop();
  fetcher.mockClear();
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["focus", "online"])(
  "refreshes on %s and only invalidates route/settings dependents when changed",
  async (event) => {
    const { client, original, invalidateRouter } = _start();
    ["filters", "people", "timeline"].forEach((key) => {
      return client.setQueryData([key], "old");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return Response.json(original);
      }),
    );
    window.dispatchEvent(new Event(event));
    await new Promise((settle) => {
      return setTimeout(settle, 20);
    });
    expect(invalidateRouter).not.toHaveBeenCalled();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return Response.json({
          ...original,
          settings: { ...original.settings, timezone: "UTC" },
        });
      }),
    );
    window.dispatchEvent(new Event(event));
    await expect
      .poll(() => {
        return client.getQueryState(["filters"])?.isInvalidated;
      })
      .toBe(true);
    expect(client.getQueryState(["people"])?.isInvalidated).toBe(true);
    expect(invalidateRouter).toHaveBeenCalledTimes(1);
  },
);

it("refreshes public settings while anonymous without reading admin settings", async () => {
  const { client } = _start();
  client.setQueryData(meQueryOptions.queryKey, null);
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      paths.push(path);
      return path === "/api/me"
        ? Response.json(
            { error: "not_signed_in", message: "Signed out" },
            { status: 401 },
          )
        : Response.json({ shoeboxName: "New public name", baseUrl: null });
    }),
  );
  window.dispatchEvent(new Event("focus"));
  await expect
    .poll(() => {
      return client.getQueryData(publicSettingsQueryOptions.queryKey)
        ?.shoeboxName;
    })
    .toBe("New public name");
  expect(paths).not.toContain("/api/settings");
});

it("observes admin-only sender and URL changes without needing /me changes", async () => {
  const { client, original } = _start("admin");
  client.setQueryData(["settings", "admin"], SETTINGS);
  client.setQueryData(["mail-health"], "old");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      return Response.json(
        path === "/api/me"
          ? original
          : {
              ...SETTINGS,
              public: { baseUrl: "https://new.example.com" },
              mail: { fromName: "New sender", fromAddress: "new@example.com" },
            },
      );
    }),
  );
  window.dispatchEvent(new Event("focus"));
  await expect
    .poll(() => {
      return client.getQueryState(["mail-health"])?.isInvalidated;
    })
    .toBe(true);
});

it("establishes an admin baseline outside settings so the first remote mail change refreshes health", async () => {
  const me = createMeResponse();
  let sender = "original@example.com";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      return Response.json(
        path === "/api/me"
          ? me
          : { ...SETTINGS, mail: { ...SETTINGS.mail, fromAddress: sender } },
      );
    }),
  );
  const { client } = _start("admin");
  client.setQueryData(["mail-health"], "old");
  await expect
    .poll(() => {
      return client.getQueryData<{ mail: { fromAddress: string } }>([
        "settings",
        "admin",
      ])?.mail.fromAddress;
    })
    .toBe("original@example.com");
  sender = "remote@example.com";
  window.dispatchEvent(new Event("focus"));
  await expect
    .poll(() => {
      return client.getQueryState(["mail-health"])?.isInvalidated;
    })
    .toBe(true);
});

it("disposes private data on sign-out and ignores a pending admin response", async () => {
  const { client } = _start("admin");
  client.setQueryData(["settings", "admin"], SETTINGS);
  client.setQueryData(["people"], "private people");
  client.setQueryData(["setup", "progress"], { needsInvitations: true });
  let release = (_value: Response) => {};
  const pending = new Promise<Response>((settle) => {
    release = settle;
  });
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      paths.push(path);
      return path === "/api/me" ? Response.json(createMeResponse()) : pending;
    }),
  );
  window.dispatchEvent(new Event("focus"));
  await expect
    .poll(() => {
      return paths.includes("/api/settings");
    })
    .toBe(true);
  client.setQueryData(meQueryOptions.queryKey, null);
  release(Response.json(SETTINGS));
  await new Promise((settle) => {
    return setTimeout(settle, 20);
  });
  expect(client.getQueryData(["people"])).toBeUndefined();
  expect(client.getQueryData(["setup", "progress"])).toBeUndefined();
  expect(client.getQueryData(["settings", "admin"])).toBeUndefined();
  expect(client.getQueryData(meQueryOptions.queryKey)).toBeNull();
});

it("does not let a background account read overwrite a serialized profile save", async () => {
  const { client, original } = _start();
  let releaseRead = (_value: Response) => {};
  const pendingRead = new Promise<Response>((settle) => {
    releaseRead = settle;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return pendingRead;
    }),
  );
  window.dispatchEvent(new Event("focus"));
  let finishSave = () => {};
  const pendingSave = new Promise<void>((settle) => {
    finishSave = settle;
  });
  const mutation = client.getMutationCache().build(client, {
    scope: { id: "me" },
    mutationFn: () => {
      return pendingSave;
    },
    onSuccess: () => {
      client.setQueryData(
        meQueryOptions.queryKey,
        createMeResponse({ role: "viewer", displayName: "Saved name" }),
      );
    },
  });
  const saving = mutation.execute(undefined);
  finishSave();
  await saving;
  releaseRead(Response.json(original));
  await new Promise((settle) => {
    return setTimeout(settle, 20);
  });
  expect(
    client.getQueryData(meQueryOptions.queryKey)?.me.member.displayName,
  ).toBe("Saved name");
});

it("waits while hidden and refreshes immediately when visible again", async () => {
  vi.useFakeTimers();
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  const { client, original } = _start();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json({
        ...original,
        settings: { ...original.settings, shoeboxName: "Visible again" },
      });
    }),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(
    client.getQueryData(meQueryOptions.queryKey)?.settings.shoeboxName,
  ).toBe("My Shoebox");
  visibility.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(
    client.getQueryData(meQueryOptions.queryKey)?.settings.shoeboxName,
  ).toBe("Visible again");
});

it("serializes signals arriving during a read and fetches the later settings afterward", async () => {
  const { client, original } = _start();
  let release = (_response: Response) => {};
  const firstRead = new Promise<Response>((settle) => {
    release = settle;
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(firstRead)
      .mockImplementation(async () => {
        return Response.json({
          ...original,
          settings: { ...original.settings, shoeboxName: "Latest family" },
        });
      }),
  );
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("online"));
  release(Response.json(original));
  await expect
    .poll(() => {
      return client.getQueryData(meQueryOptions.queryKey)?.settings.shoeboxName;
    })
    .toBe("Latest family");
});
