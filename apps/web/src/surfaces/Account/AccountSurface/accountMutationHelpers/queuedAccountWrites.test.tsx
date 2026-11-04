import { removePrivateQueries } from "@/api/me/privateQueryHelpers";
import { useProfileCompletion } from "@/surfaces/ProfileCompletion/useProfileCompletion/useProfileCompletion";
import { createMeResponse } from "@/testing/createMeResponse";
import { getRecordedLines, stubFetch } from "@/testing/fetchStubHelpers";
import {
  makeHold,
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
import { act, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSaveMe, useSaveNotify } from "./accountMutationHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([
  ["name", true],
  ["name", false],
  ["completion", true],
  ["completion", false],
  ["notify", true],
  ["notify", false],
] as const)(
  "fences queued %s intent only when retired (%s)",
  async (field, retire) => {
    const client = makeQueryClientFromItemDetail();
    const original = createMeResponse({ displayName: "Original" });
    client.setQueryData(["me"], original);
    const saved = createMeResponse({ displayName: "Saved" });
    const held = makeHold();
    const blocker = client.getMutationCache().build(client, {
      scope: { id: "me" },
      mutationFn: () => {
        return held.hold;
      },
    });
    const blocked = blocker.execute(undefined);
    stubFetch({ "PATCH /api/me": { status: 200, body: saved } });
    const onContinue = vi.fn();
    const hook = renderHookWithQueryClient({
      queryClient: client,
      useHook: () => {
        return {
          name: useSaveMe(),
          notify: useSaveNotify(),
          completion: useProfileCompletion({ account: original, onContinue }),
        };
      },
    });
    act(() => {
      hook.result.current.completion.setName("Saved");
    });
    act(() => {
      if (field === "name") {
        hook.result.current.name.save({ displayName: "Saved" });
      } else if (field === "notify") {
        hook.result.current.notify.save(saved.me.notify);
      } else {
        hook.result.current.completion.submit();
      }
    });
    await waitFor(() => {
      expect(
        client
          .getMutationCache()
          .getAll()
          .filter((entry) => {
            return entry.state.isPaused;
          }),
      ).toHaveLength(1);
    });
    expect(getRecordedLines()).toEqual([]);
    const replacement = createMeResponse({
      displayName: "Replacement",
      sessionId: "019f0000-0000-7000-8000-000000000998",
    });
    if (retire) {
      act(() => {
        removePrivateQueries(client);
        client.setQueryData(["me"], replacement);
      });
    }
    await act(async () => {
      held.letGo();
      await blocked;
    });
    await waitForWritesToSettle(client);
    expect(getRecordedLines()).toEqual(retire ? [] : ["PATCH /api/me"]);
    if (retire) {
      expect(client.getQueryData(["me"])).toEqual(replacement);
    }
    if (field === "completion") {
      expect(onContinue).toHaveBeenCalledTimes(retire ? 0 : 1);
    }
    hook.unmount();
    client.clear();
  },
);
it("keeps notification intent owned before asynchronous cancellation", async () => {
  const client = makeQueryClientFromItemDetail();
  const cancellation = makeHold();
  vi.spyOn(client, "cancelQueries").mockReturnValue(cancellation.hold);
  const replacement = createMeResponse({
    memberId: "019f0000-0000-7000-8000-000000000999",
    sessionId: "019f0000-0000-7000-8000-000000000998",
  });
  const oldIntent = { ...replacement.me.notify, onCommentTag: "off" as const };
  stubFetch({
    "PATCH /api/me": {
      status: 200,
      body: { ...replacement, me: { ...replacement.me, notify: oldIntent } },
    },
  });
  const hook = renderHookWithQueryClient({
    queryClient: client,
    useHook: useSaveNotify,
  });
  act(() => {
    hook.result.current.save(oldIntent);
  });
  await waitFor(() => {
    expect(client.cancelQueries).toHaveBeenCalled();
  });
  act(() => {
    removePrivateQueries(client);
    client.setQueryData(["me"], replacement);
  });
  await act(async () => {
    cancellation.letGo();
  });
  await waitForWritesToSettle(client);
  expect(getRecordedLines()).toEqual([]);
  expect(client.getQueryData(["me"])).toEqual(replacement);
  hook.unmount();
  client.clear();
});
