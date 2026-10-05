import type { MemberRole } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MemberRoleChoice } from "@/surfaces/Members/MemberActionDialog/MemberRoleChoice";
import { MemberRemovalConsequences } from "@/surfaces/Members/MemberActionDialog/MemberRemovalConsequences";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import { Prose } from "@/system/typography/Prose";

type Props = {
  action: Exclude<MemberAction, { kind: "invite" }>;
  role: MemberRole;
  onRole: (role: MemberRole) => void;
  isPending: boolean;
  error: string | undefined;
};
/** Consequences and role selection match the action being confirmed. */
export function MemberActionBody({
  action,
  ...choice
}: Readonly<Props>): ReactNode {
  switch (action.kind) {
    case "role":
      return <MemberRoleChoice {...choice} />;
    case "remove":
      return (
        <MemberRemovalConsequences displayName={action.member.displayName} />
      );
    case "revoke":
      return (
        <Prose>
          This closes {action.member.displayName}'s invitation and removes their
          access and group memberships. Their name, uploads and comments stay in
          the archive.
        </Prose>
      );
    case "device":
      return (
        <Prose>
          {action.session.isCurrent
            ? "You are using this one. Signing out here means you will need a fresh six-digit code to get back in, on this device."
            : `${action.session.deviceLabel} stops working straight away. Whoever is holding it will see the sign-in page and nothing else.`}
        </Prose>
      );
    case "resend":
      return null;
  }
}
