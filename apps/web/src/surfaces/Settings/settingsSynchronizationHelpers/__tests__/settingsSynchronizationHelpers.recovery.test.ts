import {
  EMPTY_SETTINGS_SNAPSHOT,
  SETTINGS_RECOVERY_KEY,
} from "../../useSettingsSnapshot";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { meQueryOptions } from "@/api/me/me";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { registerUploadSettingsRefresh } from "../refreshSettingsDependents";
import { startSettingsSynchronization } from "../settingsSynchronizationHelpers";

const disposals: Array<() => void> = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => {
    dispose();
  });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function _start() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const original = createMeResponse({ role: "viewer" });
  queryClient.setQueryData(meQueryOptions.queryKey, original);
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  harness.api.getUploadSession.mockClear();
  const unregister = registerUploadSettingsRefresh({
    queryClient,
    refresh: harness.controller.refreshSessionMetadata,
  });
  const stop = startSettingsSynchronization({
    queryClient,
    invalidateRouter: async () => {},
  });
  disposals.push(stop, unregister, () => {
    harness.controller.destroy();
    queryClient.clear();
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json({
        ...original,
        settings: { ...original.settings, timezone: "UTC" },
      });
    }),
  );
  return { harness, queryClient, stop };
}

it("retries failed remote upload metadata on an unchanged successful poll without a retry loop", async () => {
  vi.useFakeTimers();
  const { harness, queryClient } = await _start();
  const initialDay =
    harness.controller.getSnapshot().detail!.files[0]!.capturedOn;
  harness.api.getUploadSession.mockRejectedValueOnce(
    new Error("Refresh unavailable"),
  );
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(20);
  expect(
    queryClient.getQueryData(meQueryOptions.queryKey)?.settings.timezone,
  ).toBe("UTC");
  expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
  expect(harness.controller.getSnapshot().detail!.files[0]!.capturedOn).toBe(
    initialDay,
  );
  harness.api.getUploadSession.mockResolvedValueOnce({
    ...harness.serverDetail,
    files: harness.serverDetail.files.map((file) => {
      return { ...file, capturedOn: "2026-10-12" };
    }),
  });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(harness.controller.getSnapshot().detail!.files[0]!.capturedOn).toBe(
    "2026-10-12",
  );
  await vi.advanceTimersByTimeAsync(30_000);
  expect(harness.api.getUploadSession).toHaveBeenCalledTimes(2);
});

it("does not overlap pending metadata retries and retains newer changes until another refresh", async () => {
  const { harness, queryClient } = await _start();
  const olderRead = makeDeferredAnswer<typeof harness.serverDetail>();
  harness.api.getUploadSession.mockReturnValueOnce(olderRead.promise);
  window.dispatchEvent(new Event("focus"));
  await expect
    .poll(() => {
      return harness.api.getUploadSession.mock.calls.length;
    })
    .toBe(1);
  const me = queryClient.getQueryData(meQueryOptions.queryKey)!;
  const newerMe = {
    ...me,
    settings: { ...me.settings, timezone: "Asia/Manila" },
  };
  queryClient.setQueryData(meQueryOptions.queryKey, newerMe);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json({
        ...me,
        settings: { ...me.settings, timezone: "Asia/Manila" },
      });
    }),
  );
  window.dispatchEvent(new Event("focus"));
  await new Promise((settle) => {
    setTimeout(settle, 20);
  });
  expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
  olderRead.answer(harness.serverDetail);
  await new Promise((settle) => {
    setTimeout(settle, 20);
  });
  harness.api.getUploadSession.mockResolvedValueOnce({
    ...harness.serverDetail,
    files: harness.serverDetail.files.map((file) => {
      return { ...file, capturedOn: "2026-10-13" };
    }),
  });
  window.dispatchEvent(new Event("focus"));
  await expect
    .poll(() => {
      return harness.controller.getSnapshot().detail!.files[0]!.capturedOn;
    })
    .toBe("2026-10-13");
});

it.each(["sign-out", "stop"])(
  "forgets failed retries after %s",
  async (boundary) => {
    const { harness, queryClient, stop } = await _start();
    harness.api.getUploadSession.mockRejectedValueOnce(
      new Error("Refresh unavailable"),
    );
    window.dispatchEvent(new Event("focus"));
    await expect
      .poll(() => {
        return harness.api.getUploadSession.mock.calls.length;
      })
      .toBe(1);
    await new Promise((settle) => {
      setTimeout(settle, 20);
    });
    if (boundary === "stop") {
      stop();
    } else {
      queryClient.setQueryData(meQueryOptions.queryKey, null);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (path: string) => {
          return path === "/api/me"
            ? Response.json(
                { error: "not_signed_in", message: "Signed out" },
                { status: 401 },
              )
            : Response.json({ shoeboxName: "Public", baseUrl: null });
        }),
      );
    }
    window.dispatchEvent(new Event("focus"));
    await new Promise((settle) => {
      setTimeout(settle, 20);
    });
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
  },
);

it("retains remote timezone metadata work observed during committed non-timezone recovery", async () => {
  vi.useFakeTimers();
  const { harness, queryClient } = await _start();
  const uploading = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await vi.advanceTimersByTimeAsync(1);
  const before = harness.controller.getSnapshot();
  const fileId = before.detail!.files[0]!.fileId;
  harness.emitEvent({ kind: "file-started", fileId });
  let onFrame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    onFrame = callback;
    return 1;
  });
  harness.emitEvent({
    kind: "file-progress",
    fileId,
    sentBytes: 32,
    totalBytes: 100,
  });
  onFrame!(0);
  const activity = harness.controller.getSnapshot().fileActivityById;
  queryClient.setQueryData(SETTINGS_RECOVERY_KEY, {
    ...EMPTY_SETTINGS_SNAPSHOT,
    hasCommitted: true,
    isRefreshing: true,
    field: "name",
  });
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(20);
  expect(
    queryClient.getQueryData(meQueryOptions.queryKey)?.settings.timezone,
  ).toBe("UTC");
  expect(harness.api.getUploadSession).not.toHaveBeenCalled();
  queryClient.setQueryData(SETTINGS_RECOVERY_KEY, EMPTY_SETTINGS_SNAPSHOT);
  harness.api.getUploadSession.mockResolvedValueOnce({
    ...harness.serverDetail,
    files: harness.serverDetail.files.map((file) => {
      return { ...file, capturedOn: "2026-10-12" };
    }),
  });
  await vi.advanceTimersByTimeAsync(30_000);
  const after = harness.controller.getSnapshot();
  expect(after.detail!.files[0]!.capturedOn).toBe("2026-10-12");
  expect(after.filesById).toBe(before.filesById);
  expect(after.filesById.get(fileId)).toBe(harness.pickedFiles[0]);
  expect(after.fileActivityById).toBe(activity);
  expect(after.fileActivityById.get(fileId)).toEqual({
    kind: "transferring",
    sentBytes: 32,
    totalBytes: 100,
  });
  expect(after.isRunning).toBe(true);
  expect(after.phase).toBe(before.phase);
  expect(harness.engine.start).toHaveBeenCalledTimes(1);
  expect(harness.engine.cancel).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
  harness.answerRun();
  await uploading;
});
