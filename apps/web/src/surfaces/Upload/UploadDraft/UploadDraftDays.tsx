import type { ReactNode } from "react";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import { Sheet } from "@/system/Chrome/Sheet";
import { UploadDayGroup } from "../UploadDayGroup/UploadDayGroup";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
};
/** Day groups from the entire authoritative manifest. */
export function UploadDraftDays({
  snapshot,
  controller,
  previews,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="The days in this batch">
      {snapshot.detail!.days.map((day) => {
        return (
          <UploadDayGroup
            key={day.capturedOn}
            day={day}
            snapshot={snapshot}
            controller={controller}
            previews={previews}
          />
        );
      })}
    </Sheet>
  );
}
