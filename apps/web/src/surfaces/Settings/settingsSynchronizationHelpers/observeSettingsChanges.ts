import { isApplyingNavigationBootstrap } from "@/api/bootstrapHelpers/bootstrapHelpers";
import { meQueryOptions } from "@/api/me/me";
import {
  getAuthorityFromAccount,
  removePrivateQueries,
} from "@/api/me/privateQueryHelpers";
import { adminSettingsQueryOptions } from "@/api/updateAdminSettings/updateAdminSettings";
import type { MeResponse } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import {
  SETTINGS_RECOVERY_KEY,
  type SettingsSnapshot,
} from "../useSettingsSnapshot";
import { refreshSettingsDependents } from "./refreshSettingsDependents";
type SettingsReconciliationOptions = {
  owner: SynchronizationOwner & {
    dependents: ReturnType<typeof _makeDependentReconciliation>;
  };
  previous: ObservedSettings;
  current: ObservedSettings;
  canRetry: boolean;
};

type ObservedSettings = {
  me: MeResponse | undefined;
  hasObservedAccount: boolean;
  adminSignature: string | undefined;
};
type SynchronizationOwner = {
  queryClient: QueryClient;
  invalidateRouter: () => Promise<void>;
};

function _makeDependentReconciliation(queryClient: QueryClient): {
  reset: () => void;
  request: (hasTimezoneChanged: boolean) => void;
  retry: () => void;
} {
  let pending: { hasTimezoneChanged: boolean } | undefined;
  let isRunning = false;
  const reset = () => {
    pending = undefined;
  };
  return {
    reset,
    request: (hasTimezoneChanged: boolean) => {
      pending = {
        hasTimezoneChanged:
          hasTimezoneChanged || pending?.hasTimezoneChanged === true,
      };
    },
    retry: () => {
      if (isRunning || !pending) {
        return;
      }
      const attempt = pending;
      isRunning = true;
      void refreshSettingsDependents({
        queryClient,
        hasTimezoneChanged: attempt.hasTimezoneChanged,
      })
        .then(() => {
          if (pending === attempt) {
            pending = undefined;
          }
        })
        .catch(() => {})
        .finally(() => {
          isRunning = false;
        });
    },
  };
}

function _reconcile({
  owner,
  previous,
  current,
  canRetry,
}: Readonly<SettingsReconciliationOptions>): void {
  const { queryClient, invalidateRouter, dependents } = owner;
  const { hasAuthorityChanged, hasSettingsChanged, hasAdminChanged } =
    _getChanges({ previous, current });
  const isNavigation = isApplyingNavigationBootstrap(queryClient);
  if (hasAuthorityChanged) {
    dependents.reset();
    if (!isNavigation) {
      removePrivateQueries(queryClient);
    }
  }
  const recovery = queryClient.getQueryData<SettingsSnapshot>(
    SETTINGS_RECOVERY_KEY,
  );
  if (recovery?.hasCommitted) {
    const hasUncoveredTimezoneChange =
      current.me &&
      !hasAuthorityChanged &&
      previous.me?.settings.timezone !== current.me.settings.timezone &&
      (recovery.field !== "timezone" ||
        recovery.result?.shoebox.timezone !== current.me.settings.timezone);
    if (hasUncoveredTimezoneChange) {
      dependents.request(true);
    }
    return;
  }
  if (!isNavigation && (hasSettingsChanged || hasAuthorityChanged)) {
    void invalidateRouter().catch(() => {});
  }
  if (!current.me || hasAuthorityChanged) {
    return;
  }
  if (hasSettingsChanged || hasAdminChanged) {
    dependents.request(
      previous.me?.settings.timezone !== current.me.settings.timezone,
    );
  }
  if (hasSettingsChanged || hasAdminChanged || canRetry) {
    dependents.retry();
  }
}

function _getChanges({
  previous,
  current,
}: Readonly<{ previous: ObservedSettings; current: ObservedSettings }>): {
  hasAuthorityChanged: boolean;
  hasSettingsChanged: boolean;
  hasAdminChanged: boolean;
} {
  const hasAuthorityChanged =
    previous.hasObservedAccount &&
    getAuthorityFromAccount(previous.me) !==
      getAuthorityFromAccount(current.me);
  const hasSettingsChanged =
    previous.hasObservedAccount &&
    JSON.stringify(previous.me?.settings) !==
      JSON.stringify(current.me?.settings);
  const hasAdminChanged =
    previous.adminSignature !== undefined &&
    current.adminSignature !== undefined &&
    previous.adminSignature !== current.adminSignature;
  return { hasAuthorityChanged, hasSettingsChanged, hasAdminChanged };
}

function _getSettingsFromQueryClient(
  queryClient: QueryClient,
): ObservedSettings {
  const settings = queryClient.getQueryData(adminSettingsQueryOptions.queryKey);
  const account = queryClient.getQueryData(meQueryOptions.queryKey);
  return {
    me: account ?? undefined,
    hasObservedAccount: account !== undefined,
    adminSignature: settings
      ? JSON.stringify([settings.mail, settings.public])
      : undefined,
  };
}

/**
 * Reconciles actual changed values, never every successful polling response.
 */
export function observeSettingsChanges(
  owner: Readonly<SynchronizationOwner>,
): () => void {
  let previous = _getSettingsFromQueryClient(owner.queryClient);
  const dependents = _makeDependentReconciliation(owner.queryClient);
  const context = { ...owner, dependents };
  const unsubscribe = owner.queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") {
      return;
    }
    const current = _getSettingsFromQueryClient(owner.queryClient);
    const baseline = previous;
    previous = current;
    const isAccountRead =
      event.query.queryKey.length === 1 && event.query.queryKey[0] === "me";
    _reconcile({
      owner: context,
      previous: baseline,
      current,
      canRetry: isAccountRead,
    });
  });
  return () => {
    unsubscribe();
    dependents.reset();
  };
}
