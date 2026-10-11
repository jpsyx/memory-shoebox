import type { QueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/api/me/me";

const uploadRefreshers = new WeakMap<QueryClient, () => Promise<void>>();

/** Registers the member-scoped controller without giving settings File handles. */
export function registerUploadSettingsRefresh({
  queryClient,
  refresh,
}: Readonly<{
  queryClient: QueryClient;
  refresh: () => Promise<void>;
}>): () => void {
  uploadRefreshers.set(queryClient, refresh);
  return () => {
    if (uploadRefreshers.get(queryClient) === refresh) {
      uploadRefreshers.delete(queryClient);
    }
  };
}

/** The shared invalidation set for saved and remotely observed settings. */
export async function refreshSettingsDependents({
  queryClient,
  hasTimezoneChanged,
}: Readonly<{
  queryClient: QueryClient;
  hasTimezoneChanged: boolean;
}>): Promise<void> {
  const isAdmin =
    queryClient.getQueryData(meQueryOptions.queryKey)?.me.role === "admin";
  const keys = [
    "public-settings",
    "timeline",
    "items",
    "bursts",
    "milestones",
    "presence",
    "activity",
    "observations",
    "filters",
    "people",
    ...(isAdmin ? ["mail-health"] : []),
  ];
  await Promise.all([
    ...keys.map((key) => {
      return queryClient.invalidateQueries(
        { queryKey: [key] },
        { throwOnError: true },
      );
    }),
    ...(hasTimezoneChanged ? [uploadRefreshers.get(queryClient)?.()] : []),
  ]);
}
