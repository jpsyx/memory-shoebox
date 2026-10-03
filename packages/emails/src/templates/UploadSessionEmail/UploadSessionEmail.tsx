import { Text } from "@react-email/components";
import { EmailShell } from "../../lib/EmailShell.tsx";
import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";
import { OneDayBody } from "./OneDayBody.tsx";
import { ManyDaysBody } from "./ManyDaysBody.tsx";
import { uploadSessionSubject } from "./uploadSessionCopyHelpers.ts";
import { UPLOAD_SESSION_STYLES as styles } from "./UploadSessionEmail.styles.constants.ts";
type Props = { payload: UploadSessionEmailPayload };
/** The recipient's completed upload, in its single-day or multi-day shape. */
export function UploadSessionEmail({
  payload,
}: Readonly<Props>): React.JSX.Element {
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
    >
      <Text style={styles.heading}>{uploadSessionSubject(payload)}</Text>
      {payload.visibleDayCount > 1 ? (
        <ManyDaysBody payload={payload} />
      ) : (
        <OneDayBody payload={payload} />
      )}
    </EmailShell>
  );
}
