import { Text } from "@react-email/components";
import type { RemovalResolvedDeletedEmailPayload } from "@memory-shoebox/shared";
import { resolutionDateLabel } from "../../lib/removalDateLabelHelpers.ts";
import { REMOVAL_EMAIL_STYLES as styles } from "../../lib/removalEmailStyles.constants.ts";
type Props = { payload: Readonly<RemovalResolvedDeletedEmailPayload> };

/** Deleted photographs have no item link, for either recipient relation. */
export function DeletedBody({ payload }: Readonly<Props>): React.JSX.Element {
  const date = resolutionDateLabel({
    instant: payload.resolvedAt,
    timezone: payload.timezone,
  });
  return (
    <>
      <Text
        style={styles.paragraph}
      >{`${payload.resolvedByDisplayName} took it down on ${date}. It is gone: the picture and the file behind it. Nobody in ${payload.shoeboxName} can open it any more.`}</Text>
    </>
  );
}
