import { Text } from "@react-email/components";
import type { RemovalResolvedEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "../../emailTemplate.types.ts";
import { EmailShell } from "../../lib/EmailShell.tsx";
import { renderEmail } from "../../lib/renderEmail.ts";
import { DeletedBody } from "./DeletedBody.tsx";
import { DeclinedBody } from "./DeclinedBody.tsx";
import { WithdrawnBody } from "./WithdrawnBody.tsx";
import { REMOVAL_EMAIL_STYLES as styles } from "./removalEmailStyles.constants.ts";
type Props = { payload: Readonly<RemovalResolvedEmailPayload> };

/** Requester answers cannot be switched off; uploader copies can be. */
export function RemovalResolvedEmail({
  payload,
}: Readonly<Props>): React.JSX.Element {
  const isRequesterAnswer =
    payload.outcome === "declined" ||
    (payload.outcome === "deleted" && payload.relation === "requester");
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={isRequesterAnswer ? null : payload.preferencesUrl}
    >
      <Text style={styles.heading}>
        {removalResolvedEmail.subject(payload)}
      </Text>
      {payload.outcome === "deleted" ? (
        <DeletedBody payload={payload} />
      ) : payload.outcome === "declined" ? (
        <DeclinedBody payload={payload} />
      ) : (
        <WithdrawnBody payload={payload} />
      )}
    </EmailShell>
  );
}

/** Three resolved outcomes share one discriminated payload and registry kind. */
export const removalResolvedEmail: EmailTemplate<RemovalResolvedEmailPayload> =
  {
    /** Outcome-specific subjects match the approved five-state prototype. */
    subject: (payload) => {
      if (payload.outcome === "deleted") {
        return "That photo has come down";
      }
      if (payload.outcome === "declined") {
        return `${payload.declinerDisplayName} has kept that photo up, and said why`;
      }
      return "Never mind about that photo";
    },
    /** Both forms render the same outcome body. */
    render: (payload) => {
      return renderEmail(<RemovalResolvedEmail payload={payload} />);
    },
  };
