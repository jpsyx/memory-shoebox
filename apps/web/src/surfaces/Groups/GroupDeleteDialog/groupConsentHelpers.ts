import {
  groupUsageResponseSchema,
  type GroupUsageResponse,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
/** Only recognized consent conflicts can replace the displayed deletion snapshot. */
export function isGroupConsentError(error: Error): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "groups_usage_changed" ||
      error.code === "groups_confirmation_required")
  );
}
/** Invalid or unrelated conflict details never authorize a deletion. */
export function getGroupUsageFromConsentError(
  options: Readonly<{ error: Error; groupId: string }>,
): GroupUsageResponse | undefined {
  if (!(options.error instanceof ApiRequestError)) return undefined;
  const parsed = groupUsageResponseSchema.safeParse(options.error.details);
  return parsed.success && parsed.data.group.groupId === options.groupId
    ? parsed.data
    : undefined;
}

/** Failed, pending or unconfirmed snapshots cannot enable a destructive write. */
export function isGroupDeletionAllowed(
  options: Readonly<{
    usage: GroupUsageResponse | undefined;
    read: { isError: boolean; isFetching: boolean };
    mutation: { isPending: boolean };
  }>,
): boolean {
  return (
    options.usage !== undefined &&
    !options.read.isError &&
    !options.read.isFetching &&
    !options.mutation.isPending &&
    (options.usage.rules.length === 0 ||
      options.usage.confirmationToken !== null)
  );
}
