import system from "@/system/system.module.css";
import type { UploadSessionController } from "@/upload/uploadSessionController/uploadSessionController.types";
import { Button } from "@mantine/core";
import type { UploadDayGroup as Day } from "@memory-shoebox/shared";
import { type ReactNode } from "react";
type Props = {
  day: Day;
  controller: UploadSessionController;
  tickedCount: number;
  eligibleCount: number;
  canSelect: boolean;
};

/** Keeps the day selection action beside its ticked count. */
export function UploadDaySelection({
  day,
  controller,
  tickedCount,
  eligibleCount,
  canSelect,
}: Readonly<Props>): ReactNode {
  return (
    <span className={system.uploadDayEnd}>
      {tickedCount > 0 ? (
        <span className={system.fileMeta}>{tickedCount} ticked</span>
      ) : null}
      {canSelect && eligibleCount > 0 ? (
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            return controller.selectDay(day.capturedOn);
          }}
        >
          Tick all {eligibleCount}
        </Button>
      ) : null}
    </span>
  );
}
