import { ChipRow } from "@/system/Chip/ChipRow";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadFilePicker } from "../../UploadSurface/UploadFilePicker/UploadFilePicker";
import { getResumeActionFromSnapshot } from "../uploadResumeHelpers";
import { UploadCloseBatchButton } from "./UploadCloseBatchButton";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onPick: (files: readonly File[]) => void;
};
/** Resume retained originals together, or choose any unavailable originals again. */
export function UploadResumeActions({
  snapshot,
  controller,
  onPick,
}: Readonly<Props>): ReactNode {
  const { retainedIds, hasUnavailableOriginals, isDisabled, label } =
    getResumeActionFromSnapshot(snapshot);
  return (
    <ChipRow>
      {retainedIds.length > 0 ? (
        <Button
          disabled={isDisabled}
          onClick={() => {
            void controller.retryMissingFiles(retainedIds).catch(() => {});
          }}
        >
          {label}
        </Button>
      ) : null}
      {hasUnavailableOriginals ? (
        <UploadFilePicker
          onPick={onPick}
          isDisabled={isDisabled}
          label="Choose files to resume"
          variant={retainedIds.length > 0 ? "default" : "filled"}
        />
      ) : null}
      <UploadCloseBatchButton snapshot={snapshot} controller={controller} />
    </ChipRow>
  );
}
