import { Link, Text } from "@react-email/components";
import type { RemovalRequestEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import { EmailShell } from "../lib/EmailShell.tsx";
import { renderEmail } from "../lib/renderEmail.ts";
import { calendarDayLabel } from "./RemovalResolvedEmail/removalDateLabels.ts";
import { REMOVAL_EMAIL_STYLES as styles } from "./RemovalResolvedEmail/removalEmailStyles.constants.ts";

type Props = { payload: Readonly<RemovalRequestEmailPayload> };

/** Relationship-specific copy never calls an admin the uploader. */
function _lede(payload: Readonly<RemovalRequestEmailPayload>): string {
  const uploader =
    payload.relation === "uploader" ? "You" : payload.uploaderDisplayName;
  const tagged = payload.isRequesterTagged
    ? `${payload.requesterDisplayName} is tagged in it. `
    : "";
  return `${tagged}${uploader} put it up on ${calendarDayLabel({ day: payload.itemUploadedOn })}.`;
}

/** The ask tells the uploader and admins that nothing has happened yet. */
export function RemovalRequestEmail({
  payload,
}: Readonly<Props>): React.JSX.Element {
  const requester = payload.requesterDisplayName;
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
    >
      <Text style={styles.heading}>{removalRequestEmail.subject(payload)}</Text>
      <Text style={styles.paragraph}>{`${_lede(payload)}`}</Text>
      {payload.reason === null ? null : (
        <Text style={styles.quote}>{payload.reason}</Text>
      )}
      <Text style={styles.paragraph}>
        <b>Nothing has happened to the photo.</b>
        {
          " It is still there and everybody who could see it still can, until you or an admin does something."
        }
      </Text>
      <Link style={styles.action} href={payload.requestsUrl}>
        Have a look
      </Link>
      <Text
        style={styles.paragraph}
      >{`You can delete it, or keep it and tell ${requester} why. Either is fine; leaving it is not, because ${requester} is waiting.`}</Text>
      <Text style={styles.paragraph}>This went to you and to every admin.</Text>
    </EmailShell>
  );
}

/** Request copy, with both mail forms derived from the same component. */
export const removalRequestEmail: EmailTemplate<RemovalRequestEmailPayload> = {
  /** Names the requester without inferring gender. */
  subject: (payload) => {
    return `${payload.requesterDisplayName} has asked for a photo to come down`;
  },
  /** Renders only the frozen payload. */
  render: (payload) => {
    return renderEmail(<RemovalRequestEmail payload={payload} />);
  },
};
