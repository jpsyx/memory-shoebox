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
  onRemove?: (fileId: string, trigger: HTMLElement) => void;
  viewer?: { memberId: string; isAdmin?: boolean };
};

/** Non-duplicate capture-day prints; ticks edit targets without an API write. */
export function UploadDayGroup({
  day,
  snapshot,
  controller,
  previews,
  onRemove,
  viewer,
}: Readonly<Props>): ReactNode {
  const [isExpanded, setIsExpanded] = useState(false);
  const files =
    snapshot.detail?.files.filter((file) => {
      return (
        file.capturedOn === day.capturedOn &&
        !file.duplicateReason &&
        snapshot.fileActivityById.get(file.fileId)?.kind !== "duplicate"
      );
    }) ?? [];
  const visible = isExpanded ? files : files.slice(0, 12);
  const canSelect = snapshot.detail?.state === "draft" && !snapshot.isBusy;
  if (files.length === 0) {
    return null;
  }
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
        onRemove={onRemove}
        files={visible}
        canSelect={canSelect}
        canManageBursts={Boolean(
          viewer &&
          (viewer.isAdmin ||
            viewer.memberId === snapshot.detail?.uploadedBy.memberId),
        )}
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
