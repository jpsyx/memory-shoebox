import { Link, Text } from "@react-email/components";
import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";
import { weekdayDayLabel } from "./uploadSessionCopyHelpers.ts";
import { UPLOAD_SESSION_STYLES as styles } from "./UploadSessionEmail.styles.constants.ts";
type Props = { payload: UploadSessionEmailPayload };
/** The single-day upload message for this recipient's visible photos. */
export function OneDayBody({ payload }: Readonly<Props>): React.JSX.Element {
  return (
    <>
      <Text style={styles.paragraph}>
        {`${weekdayDayLabel(payload.capturedOn)}.`}
        {payload.milestoneName === null ? null : (
          <>
            {" That day is now a milestone: "}
            <b>{payload.milestoneName}</b>
            {"."}
          </>
        )}
      </Text>
      <Link style={styles.action} href={payload.dayUrl}>
        See the day
      </Link>
      <Text style={styles.paragraph}>
        This is one email for the whole lot, not one per photograph. It only
        ever arrives when somebody finishes putting a batch up.
      </Text>
      <Text style={styles.paragraph}>
        You are getting it because you can see at least one of them.
      </Text>
    </>
  );
}
