import { ChipRow } from "@/system/Chip/ChipRow";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Button } from "@mantine/core";
import {
  setUploadVisibilityRequestSchema,
  type SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  visibility: SetUploadVisibilityRequest;
  onStart: () => void;
};
/** Uploads every accepted file; ticks never choose what goes up. */
export function UploadDraftFooter({
  snapshot,
  controller,
  visibility,
  onStart,
}: Readonly<Props>): ReactNode {
  const accepted = snapshot.detail!.files.filter((file) => {
    return file.state !== "refused" && file.state !== "cancelled";
  }).length;
  return (
    <ChipRow>
      <Button
        disabled={
          snapshot.isBusy ||
          accepted === 0 ||
          !setUploadVisibilityRequestSchema.safeParse(visibility).success
        }
        onClick={onStart}
      >
        Put {accepted.toLocaleString("en-GB")} up
      </Button>
      <Button
        variant="panel"
        disabled={snapshot.isBusy}
        onClick={() => {
          void controller.cancelDraft().catch(() => {});
        }}
      >
        Cancel
      </Button>
    </ChipRow>
  );
}
