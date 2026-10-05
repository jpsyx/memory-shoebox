import type { MemberAction } from "@/surfaces/Members/useMemberMutation";

/** The protected action's dialog heading. */
export function memberConfirmationTitle(
  action: Readonly<Exclude<MemberAction, { kind: "invite" }>>,
): string {
  switch (action.kind) {
    case "role":
      return `What can ${action.member.displayName} do?`;
    case "remove":
      return `Remove ${action.member.displayName}?`;
    case "revoke":
      return `Revoke ${action.member.displayName}'s invitation?`;
    default:
      return "Sign this device out?";
  }
}
/** The explicit action described by the confirmation button. */
export function memberConfirmationButton(
  action: Readonly<Exclude<MemberAction, { kind: "invite" }>>,
): string {
  switch (action.kind) {
    case "role":
      return "Save";
    case "remove":
      return "Remove them";
    case "revoke":
      return "Revoke invitation";
    case "device":
      return action.session.isCurrent ? "Sign out here" : "Sign it out";
    default:
      return "Send it again";
  }
}
