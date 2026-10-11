import type { MeResponse } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/api/me/me";
import { adminSettingsQueryOptions } from "@/api/updateAdminSettings/updateAdminSettings";
import {
  SETTINGS_RECOVERY_KEY,
  type SettingsSnapshot,
} from "../useSettingsSnapshot";
import { refreshSettingsDependents } from "./refreshSettingsDependents";

type ObservedSettings = {
  me: MeResponse | null | undefined;
  adminSignature: string | undefined;
};
type SynchronizationOwner = Readonly<{
  queryClient: QueryClient;
  invalidateRouter: () => Promise<void>;
}>;

function _reconcile({
  owner,
  previous,
  current,
}: Readonly<{
  owner: SynchronizationOwner;
  previous: ObservedSettings;
  current: ObservedSettings;
}>): void {
  const { queryClient, invalidateRouter } = owner;
  const { hasAuthorityChanged, hasSettingsChanged, hasAdminChanged } =
    _getChanges(previous, current);
  if (hasAuthorityChanged) {
    _removePrivateQueries(queryClient);
  }
  if (
    queryClient.getQueryData<SettingsSnapshot>(SETTINGS_RECOVERY_KEY)
      ?.hasCommitted
  ) {
    return;
  }
  if (hasSettingsChanged || hasAuthorityChanged) {
    void invalidateRouter().catch(() => {});
  }
  if (
    current.me &&
    (hasSettingsChanged || hasAdminChanged) &&
    !hasAuthorityChanged
  ) {
    void refreshSettingsDependents(
      queryClient,
      previous.me?.settings.timezone !== current.me.settings.timezone,
    ).catch(() => {});
  }
}

function _getChanges(previous: ObservedSettings, current: ObservedSettings) {
  const hasAuthorityChanged =
    previous.me !== undefined &&
    _getIdentity(previous.me) !== _getIdentity(current.me);
  const hasSettingsChanged =
    previous.me !== undefined &&
    JSON.stringify(previous.me?.settings) !==
      JSON.stringify(current.me?.settings);
  const hasAdminChanged =
    previous.adminSignature !== undefined &&
    current.adminSignature !== undefined &&
    previous.adminSignature !== current.adminSignature;
  return { hasAuthorityChanged, hasSettingsChanged, hasAdminChanged };
}

function _removePrivateQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (query) => {
      const key = JSON.stringify(query.queryKey);
      return !['["me"]', '["public-settings"]', '["setup","status"]'].includes(
        key,
      );
    },
  });
}

function _getIdentity(account: MeResponse | null | undefined): string {
  return JSON.stringify([account?.me.member.memberId, account?.me.role]);
}
function _getSettingsFromQueryClient(
  queryClient: QueryClient,
): ObservedSettings {
  const settings = queryClient.getQueryData(adminSettingsQueryOptions.queryKey);
  return {
    me: queryClient.getQueryData(meQueryOptions.queryKey),
    adminSignature: settings
      ? JSON.stringify([settings.mail, settings.public])
      : undefined,
  };
}

/** Reconciles actual changed values, never every successful polling response. */
export function observeSettingsChanges(
  owner: SynchronizationOwner,
): () => void {
  let previous = _getSettingsFromQueryClient(owner.queryClient);
  return owner.queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") {
      return;
    }
    const current = _getSettingsFromQueryClient(owner.queryClient);
    const baseline = previous;
    previous = current;
    _reconcile({ owner, previous: baseline, current });
  });
}
