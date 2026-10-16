import {
  ensureAccountReadProtection,
  hasPendingAccountWrite,
} from "@/api/me/accountReadProtectionHelpers/accountReadProtectionHelpers";
import { meQueryOptions } from "@/api/me/me";
import { publicSettingsQueryOptions } from "@/api/publicSettings/publicSettings";
import { adminSettingsQueryOptions } from "@/api/updateAdminSettings/updateAdminSettings";
import type { QueryClient } from "@tanstack/react-query";
import { observeSettingsChanges } from "./observeSettingsChanges";

const CHANNEL_NAME = "shoebox-settings";
const CHANGE_NOTIFICATION = "settings-changed";

async function _refreshSettings({
  queryClient,
  isActive,
}: Readonly<{
  queryClient: QueryClient;
  isActive: () => boolean;
}>): Promise<void> {
  if (hasPendingAccountWrite(queryClient)) {
    return;
  }
  const me = await queryClient.fetchQuery({
    ...meQueryOptions,
    staleTime: 0,
    retry: false,
  });
  const currentMe = queryClient.getQueryData(meQueryOptions.queryKey);
  if (
    !isActive() ||
    currentMe === undefined ||
    currentMe?.me.member.memberId !== me?.me.member.memberId ||
    currentMe?.me.role !== me?.me.role ||
    hasPendingAccountWrite(queryClient)
  ) {
    return;
  }
  if (me === null) {
    await queryClient.fetchQuery({
      ...publicSettingsQueryOptions,
      staleTime: 0,
    });
  } else if (me.me.role === "admin") {
    await queryClient.fetchQuery(adminSettingsQueryOptions);
  }
}

function _makeRefreshScheduler(queryClient: QueryClient): {
  refresh: () => void;
  isActive: () => boolean;
  stop: () => void;
} {
  let isStopped = false;
  let pending: Promise<void> | undefined;
  let isQueued = false;
  const isActive = () => {
    return !isStopped;
  };
  const refresh = () => {
    if (isStopped || document.visibilityState === "hidden") {
      return;
    }
    if (pending) {
      isQueued = true;
      return;
    }
    pending = _refreshSettings({ queryClient, isActive })
      .catch(() => {})
      .finally(() => {
        pending = undefined;
        if (isQueued) {
          isQueued = false;
          refresh();
        }
      });
  };
  return {
    refresh,
    isActive,
    stop: () => {
      isStopped = true;
    },
  };
}

function _listenForSettingsChanges(refresh: () => void): () => void {
  const channel =
    typeof BroadcastChannel === "undefined"
      ? undefined
      : new BroadcastChannel(CHANNEL_NAME);
  if (channel) {
    channel.onmessage = (event) => {
      if (event.data === CHANGE_NOTIFICATION) {
        refresh();
      }
    };
  }
  return () => {
    return channel?.close();
  };
}

function _readAdminBaseline(queryClient: QueryClient): void {
  if (
    queryClient.getQueryData(meQueryOptions.queryKey)?.me.role === "admin" &&
    !queryClient.getQueryData(adminSettingsQueryOptions.queryKey) &&
    !hasPendingAccountWrite(queryClient)
  ) {
    void queryClient.fetchQuery(adminSettingsQueryOptions).catch(() => {});
  }
}

/** Announces a committed write, never transmitting member or setting values. */
export function notifySettingsChanged(): void {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(CHANGE_NOTIFICATION);
  channel.close();
}

/**
 * One owner per root, with serialized reads and disposable browser listeners.
 */
export function startSettingsSynchronization(
  options: Readonly<{
    queryClient: QueryClient;
    invalidateRouter: () => Promise<void>;
  }>,
): () => void {
  const stopObserving = observeSettingsChanges(options);
  ensureAccountReadProtection(options.queryClient);
  const scheduler = _makeRefreshScheduler(options.queryClient);
  const closeChannel = _listenForSettingsChanges(scheduler.refresh);
  queueMicrotask(() => {
    if (scheduler.isActive()) {
      _readAdminBaseline(options.queryClient);
    }
  });
  const timer = window.setInterval(scheduler.refresh, 30_000);
  window.addEventListener("focus", scheduler.refresh);
  window.addEventListener("online", scheduler.refresh);
  document.addEventListener("visibilitychange", scheduler.refresh);
  return () => {
    scheduler.stop();
    stopObserving();
    closeChannel();
    window.clearInterval(timer);
    window.removeEventListener("focus", scheduler.refresh);
    window.removeEventListener("online", scheduler.refresh);
    document.removeEventListener("visibilitychange", scheduler.refresh);
  };
}
