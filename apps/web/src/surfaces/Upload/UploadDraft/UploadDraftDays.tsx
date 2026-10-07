import { Sheet } from "@/system/Chrome/Sheet";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { ReactNode } from "react";
import { UploadDayGroup } from "../UploadDayGroup/UploadDayGroup";
import classes from "./UploadDraftDays.module.css";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  onRemove?: (fileId: string, trigger: HTMLElement) => void;
};
/** Day groups from the entire authoritative manifest. */
export function UploadDraftDays({
  snapshot,
  controller,
  previews,
  onRemove,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet
      wide
      label="The days in this batch"
      className={classes.uploadDraftDays}
    >
      {snapshot.detail!.days.map((day) => {
        return (
          <UploadDayGroup
            key={day.capturedOn}
            day={day}
            snapshot={snapshot}
            controller={controller}
            previews={previews}
            onRemove={onRemove}
          />
        );
      })}
    </Sheet>
  );
}
