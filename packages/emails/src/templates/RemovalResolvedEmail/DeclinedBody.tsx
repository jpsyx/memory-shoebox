import { Link, Text } from "@react-email/components";
import type { RemovalResolvedDeclinedEmailPayload } from "@memory-shoebox/shared";
import { REMOVAL_EMAIL_STYLES as styles } from "../../lib/removalEmailStyles.constants.ts";
type Props = { payload: Readonly<RemovalResolvedDeclinedEmailPayload> };

/** The decliner's actual words precede every other body paragraph. */
export function DeclinedBody({ payload }: Readonly<Props>): React.JSX.Element {
  return (
    <>
      <Text style={styles.quote}>{payload.declineReason}</Text>
      <Text style={styles.paragraph}>
        The photo is still there. Who can see it may have changed.
      </Text>
      <Link style={styles.action} href={payload.itemUrl}>
        Have a look
      </Link>
      <Text style={styles.paragraph}>
        If you are not happy with that, ask again, or tell an admin. Nobody will
        think less of you for it.
      </Text>
    </>
  );
}
