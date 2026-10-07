import { Link, Text } from "@react-email/components";
import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";
import {
  capitalizedDayCountLabel,
  firstDayLabel,
  longDayLabel,
} from "./uploadSessionCopyHelpers.ts";
import { UPLOAD_SESSION_STYLES as styles } from "./UploadSessionEmail.styles.constants.ts";
type Props = { payload: UploadSessionEmailPayload };
/** The multi-day upload message, with a milestone on its last day. */
export function ManyDaysBody({ payload }: Readonly<Props>): React.JSX.Element {
  return (
    <>
      <Text style={styles.paragraph}>
        {`${capitalizedDayCountLabel(payload.visibleDayCount)} days between `}
        <b>{firstDayLabel(payload)}</b>
        {" and "}
        <b>{longDayLabel(payload.lastCapturedOn)}</b>
        {"."}
        {payload.milestoneName === null ? null : (
          <>
            {" The last of them is now a milestone: "}
            <b>{payload.milestoneName}</b>
            {"."}
          </>
        )}
      </Text>
      <Link style={styles.action} href={payload.dayUrl}>
        See them
      </Link>
      <Text style={styles.paragraph}>
        You are getting this because you can see at least one of them.
      </Text>
    </>
  );
}
