import { Stack } from "@mantine/core";
import { type ReactNode } from "react";
import { UploadRecoveryChoice } from "./UploadRecoveryChoice";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };
/** Requires an explicit id association for one ambiguous picked file at a time. */
export function UploadRecoveryChoices({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const match = snapshot.recoveryMatches.ambiguous[0];
  return (
    <Stack gap="sm">
      {snapshot.recoveryMatches.unmatchedClientRefs.length > 0 ? (
        <Prose>
          {snapshot.recoveryMatches.unmatchedClientRefs.length} extra chosen
          files are outside this batch. They have not been sent. Upload them in
          a new batch after this one ends.
        </Prose>
      ) : null}
      {snapshot.recoveryMatches.alreadyUpClientRefs.length > 0 ? (
        <Prose>
          {snapshot.recoveryMatches.alreadyUpClientRefs.length} chosen files are
          already up and will not be sent again.
        </Prose>
      ) : null}
      {match ? (
        <UploadRecoveryChoice
          key={match.clientRef}
          snapshot={snapshot}
          controller={controller}
        />
      ) : null}
    </Stack>
  );
}
