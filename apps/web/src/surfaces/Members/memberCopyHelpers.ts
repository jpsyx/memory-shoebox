import type { ComboboxData } from "@mantine/core";
import type {
  AdminMemberDto,
  ApiErrorDetails,
  MemberRole,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/** The same roles in invitation and authority forms. */
export const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "uploader", label: "Uploader" },
  { value: "admin", label: "Admin" },
] as const satisfies ComboboxData;
/** Role names used on directory rows. */
export const ROLE_WORD: Record<MemberRole, string> = {
  viewer: "Viewer",
  uploader: "Uploader",
  admin: "Admin",
} as const;
/** The active-admin safeguard; invited authority never counts. */
export function isLastActiveAdmin(
  options: Readonly<{
    member: AdminMemberDto;
    members: readonly AdminMemberDto[];
  }>,
): boolean {
  return (
    options.member.status === "active" &&
    options.member.role === "admin" &&
    (options.member.isLastActiveAdmin ||
      options.members.filter((member) => {
        return member.status === "active" && member.role === "admin";
      }).length <= 1)
  );
}
/** Accessible local-time directory dates, without claiming an absent visit. */
export function memberDate(
  options: Readonly<{ timestamp: string | undefined; timezone: string }>,
): string {
  return options.timestamp === undefined
    ? "Not yet"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: options.timezone,
      }).format(new Date(options.timestamp));
}
/** A refused mutation's recovery, branching on stable contract codes. */
export function memberFailure(error: unknown): string {
  if (!(error instanceof ApiRequestError)) {
    return "That could not be saved. Your choices are still here; try again.";
  }
  switch (error.code) {
    case "members_last_admin":
      return "This is the only active admin. Make somebody else an active admin first.";
    case "rate_limited":
      return `Wait ${error.details?.retryAfterSeconds ?? 60} seconds before sending another invitation.`;
    case "members_already_active":
    case "members_already_invited":
      return "That address already belongs to a member. Check the directory below.";
    case "invitations_not_pending":
      return "That invitation is no longer pending. The directory has been refreshed.";
    case "members_forbidden":
      return "Your admin access has changed. Refreshing your account.";
    case "not_signed_in":
      return "This device is no longer signed in.";
    case "invalid_request":
      return "Check the marked fields, then try again.";
    default:
      return "That could not be saved. Your choices are still here; try again.";
  }
}
/** Server field details stay attached to the named form control. */
export function memberFieldError(
  options: Readonly<{ details: ApiErrorDetails | undefined; field: string }>,
): string | undefined {
  return options.details?.fieldErrors?.[options.field]?.join(" ");
}
