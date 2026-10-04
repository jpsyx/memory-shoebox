import { Link, Text } from "@react-email/components";
import type { RemovalReminderEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import { EmailShell } from "../lib/EmailShell.tsx";
import { renderEmail } from "../lib/renderEmail.ts";
import { calendarDayLabel } from "./RemovalResolvedEmail/removalDateLabelHelpers.ts";
import { REMOVAL_EMAIL_STYLES as styles } from "./RemovalResolvedEmail/removalEmailStyles.constants.ts";

type Props = { payload: Readonly<RemovalReminderEmailPayload> };

/** Weekly reminder age comes from the request's local-calendar week index. */
export function RemovalReminderEmail({
  payload,
}: Readonly<Props>): React.JSX.Element {
  const requester = payload.requesterDisplayName;
  const age = payload.weekIndex === 1 ? "a week" : `${payload.weekIndex} weeks`;
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
    >
      <Text style={styles.heading}>
        {removalReminderEmail.subject(payload)}
      </Text>
      <Text
        style={styles.paragraph}
      >{`${requester} asked ${age} ago, on ${calendarDayLabel({ day: payload.requestedOn })}, and nothing has happened yet.`}</Text>
      {payload.reason === null ? null : (
        <Text style={styles.quote}>{payload.reason}</Text>
      )}
      <Link style={styles.action} href={payload.requestsUrl}>
        Take a look
      </Link>
      <Text
        style={styles.paragraph}
      >{`Delete it, or keep it and tell ${requester} why. Either is an answer. This will keep arriving once a week until one of you does one or the other, because ${requester} has no way of knowing whether anybody saw it.`}</Text>
    </EmailShell>
  );
}

/** The reminder template keeps the subject stable as its age advances. */
export const removalReminderEmail: EmailTemplate<RemovalReminderEmailPayload> =
  {
    /** Names the person still waiting. */
    subject: (payload) => {
      return `${payload.requesterDisplayName} is still waiting on that photo`;
    },
    /** Renders both alternatives without a database read. */
    render: (payload) => {
      return renderEmail(<RemovalReminderEmail payload={payload} />);
    },
  };
