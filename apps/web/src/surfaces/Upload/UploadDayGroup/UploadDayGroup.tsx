import system from "@/system/system.module.css";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadDayGroup as Day } from "@memory-shoebox/shared";
import { useState, type ReactNode } from "react";
import { UploadDayHeader } from "./UploadDayHeader";
import { UploadDayMilestones } from "./UploadDayMilestones";
import { UploadDayPrints } from "./UploadDayPrints/UploadDayPrints";
import { UploadDayReveal } from "./UploadDayReveal/UploadDayReveal";

type Props = {
  day: Day;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
};

/** Server capture-day grouping; ticks edit targets without writing an API. */
export function UploadDayGroup({
  day,
  snapshot,
  controller,
  previews,
}: Readonly<Props>): ReactNode {
  const [isExpanded, setIsExpanded] = useState(false);
  const files =
    snapshot.detail?.files.filter((file) => {
      return file.capturedOn === day.capturedOn;
    }) ?? [];
  const visible = isExpanded ? files : files.slice(0, 12);
  const canSelect = snapshot.detail?.state === "draft" && !snapshot.isBusy;
  return (
    <section className={system.uploadDay} aria-label={day.capturedOn}>
      <UploadDayHeader
        day={day}
        snapshot={snapshot}
        controller={controller}
        files={files}
        canSelect={canSelect}
      />
      <UploadDayMilestones day={day} />
      <UploadDayPrints
        snapshot={snapshot}
        controller={controller}
        previews={previews}
        files={visible}
        canSelect={canSelect}
      />
      <UploadDayReveal
        fileCount={files.length}
        visibleCount={visible.length}
        onReveal={() => {
          return setIsExpanded(true);
        }}
      />
    </section>
  );
}
