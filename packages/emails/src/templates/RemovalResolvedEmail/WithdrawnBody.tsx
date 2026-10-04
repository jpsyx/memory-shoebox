import { Link, Text } from "@react-email/components";
import type { RemovalResolvedWithdrawnEmailPayload } from "@memory-shoebox/shared";
import {
  calendarDayLabel,
  resolutionDateLabel,
} from "../../lib/removalDateLabelHelpers.ts";
import { REMOVAL_EMAIL_STYLES as styles } from "../../lib/removalEmailStyles.constants.ts";
type Props = { payload: Readonly<RemovalResolvedWithdrawnEmailPayload> };

/** Withdrawal removes the task and explicitly leaves the photo untouched. */
export function WithdrawnBody({ payload }: Readonly<Props>): React.JSX.Element {
  const capturedOn = calendarDayLabel({ day: payload.itemCapturedOn });
  const withdrawnOn = resolutionDateLabel({
    instant: payload.resolvedAt,
    timezone: payload.timezone,
    includeYear: false,
  });
  return (
    <>
      <Text
        style={styles.paragraph}
      >{`${payload.withdrawnByDisplayName} asked about a photo from ${capturedOn}, and on ${withdrawnOn} ${payload.withdrawnByDisplayName} took the request back. There is nothing for you to do.`}</Text>
      <Text style={styles.paragraph}>
        The photo has not been touched. It is still there and the same people
        can still see it.
      </Text>
      <Link style={styles.action} href={payload.itemUrl}>
        Have a look
      </Link>
    </>
  );
}
