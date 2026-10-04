import { Link, Text } from "@react-email/components";
import type { InvitationEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import { EmailShell } from "../lib/EmailShell/EmailShell.tsx";
import { renderEmail } from "../lib/renderEmail.ts";

type Props = { payload: InvitationEmailPayload };

function _archiveCopy(count: number): string {
  if (count === 0) {
    return "There are no photos or videos yet. The family will put them here.";
  }
  return count === 1
    ? "It holds 1 photo or video of the family."
    : `It holds ${count.toLocaleString("en-US")} photos and videos of the family.`;
}

function _expiryCopy(payload: Readonly<InvitationEmailPayload>): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: payload.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(payload.expiresAt));
  return `This invitation lasts seven days, until ${date}. Sent by ${payload.inviterDisplayName} (${payload.inviterEmail}).`;
}

/** Invitation copy, with an address-prefilled entry and no credential. */
export function InvitationEmail({
  payload,
}: Readonly<Props>): React.JSX.Element {
  return (
    <EmailShell shoeboxName={payload.shoeboxName} preferencesUrl={null}>
      <Text
        style={{ fontSize: "24px", fontWeight: "bold", margin: "24px 0 0" }}
      >
        {invitationEmail.subject(payload)}
      </Text>
      <Text>{_archiveCopy(payload.visibleItemCount)}</Text>
      <Text>{`Only the ${payload.memberCount} ${payload.memberCount === 1 ? "person" : "people"} in it can see them. There is nothing to install and no password to make up.`}</Text>
      <Link href={payload.joinUrl}>{`Open ${payload.shoeboxName}`}</Link>
      <Text>
        It will ask for this address, <b>{payload.invitedAddress}</b>, and then
        email you a six-digit code to type in. That is the whole thing.
      </Text>
      <Text>{_expiryCopy(payload)}</Text>
    </EmailShell>
  );
}

/** The final product email kind, consumed by the persisted queue. */
export const invitationEmail: EmailTemplate<InvitationEmailPayload> = {
  /** The inviter and Shoebox identity frozen when the invitation is queued. */
  subject: (payload) => {
    return `${payload.inviterDisplayName} has added you to ${payload.shoeboxName}`;
  },
  /** Render HTML and a standalone text alternative from the same copy. */
  render: (payload) => {
    return renderEmail(<InvitationEmail payload={payload} />);
  },
};
