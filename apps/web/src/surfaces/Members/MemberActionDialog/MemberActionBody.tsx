import { NativeSelect } from "@mantine/core";
import type { MemberRole } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { ROLE_OPTIONS } from "@/surfaces/Members/memberCopy";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import { Banner } from "@/system/Chrome/Banner";
import { Prose } from "@/system/typography/Prose";

type Props = {
  action: Exclude<MemberAction, { kind: "invite" }>;
  role: MemberRole;
  onRole: (role: MemberRole) => void;
  isPending: boolean;
  error: string | undefined;
};
/** Consequences read before confirmation, without suggesting content deletion. */
export function MemberActionBody({
  action,
  role,
  onRole,
  isPending,
  error,
}: Readonly<Props>): ReactNode {
  switch (action.kind) {
    case "role":
      return (
        <>
          <NativeSelect
            label="Role"
            data={ROLE_OPTIONS}
            value={role}
            onChange={(event) => {
              return onRole(event.currentTarget.value as MemberRole);
            }}
            disabled={isPending}
            error={error}
          />
          <Prose>
            Every higher role can do everything the lower ones can. An admin can
            demote themselves when another active admin remains.
          </Prose>
        </>
      );
    case "remove":
      return (
        <>
          <Prose>
            {action.member.displayName} loses access straight away, on every
            device. Nothing they uploaded or wrote is deleted, and their name
            stays on it.
          </Prose>
          <Banner>
            They stay a person in the archive. Photographs tagged with them keep
            the tag, so inviting them back later picks up where this left off.
          </Banner>
        </>
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
