import system from "@/system/system.module.css";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type {
  UploadDayGroup as Day,
  UploadFileDto,
} from "@memory-shoebox/shared";
import { type ReactNode } from "react";
import { UploadDaySelection } from "./UploadDaySelection";
type Props = {
  day: Day;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  files: readonly UploadFileDto[];
  canSelect: boolean;
};

/** Shows the capture day, saved file count and day selection. */
export function UploadDayHeader({
  day,
  snapshot,
  controller,
  files,
  canSelect,
}: Readonly<Props>): ReactNode {
  const date = new Date(`${day.capturedOn}T12:00:00Z`);
  const eligible = files.filter((file) => {
    return file.state !== "refused" && file.state !== "cancelled";
  });
  const tickedCount = eligible.filter((file) => {
    return snapshot.selectedFileIds.has(file.fileId);
  }).length;
  return (
    <div className={system.uploadDayHead}>
      <span className={system.uploadDayFigure}>{date.getUTCDate()}</span>
      <span className={system.uploadDayMonth}>
        {date.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })}
      </span>
      <span className={system.uploadDayCount}>
        {day.fileCount.toLocaleString("en-GB")}
      </span>
      <UploadDaySelection
        day={day}
        controller={controller}
        tickedCount={tickedCount}
        eligibleCount={eligible.length}
        canSelect={canSelect}
      />
    </div>
  );
}
