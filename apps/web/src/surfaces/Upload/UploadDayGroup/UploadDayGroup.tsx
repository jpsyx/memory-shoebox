import { clsx } from "clsx";
import { Button } from "@mantine/core";
import { IconFlag } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type {
  UploadDayGroup as Day,
  UploadFileDto,
} from "@memory-shoebox/shared";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import { UploadPrint } from "./UploadPrint";
import system from "@/system/system.module.css";
import classes from "../upload.module.css";

type Props = {
  day: Day;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
};

/** Server capture-day grouping; ticks edit targets without writing an API. */
export function UploadDayGroup(props: Readonly<Props>): ReactNode {
  const [isExpanded, setIsExpanded] = useState(false);
  const files =
    props.snapshot.detail?.files.filter((file) => {
      return file.capturedOn === props.day.capturedOn;
    }) ?? [];
  const visible = isExpanded ? files : files.slice(0, 12);
  const canSelect =
    props.snapshot.detail?.state === "draft" && !props.snapshot.isBusy;
  return (
    <section className={system.uploadDay} aria-label={props.day.capturedOn}>
      {_dayHeader(props, files, canSelect)}
      {_dayMilestones(props.day)}
      {_dayPrints(props, visible, canSelect)}
      {_dayReveal(files.length, visible.length, () => {
        return setIsExpanded(true);
      })}
    </section>
  );
}

function _dayMilestones(day: Day): ReactNode {
  return (
    <div className={system.uploadDayMilestone}>
      {day.milestones.length > 0 ? (
        <>
          <IconFlag size="1rem" aria-hidden="true" />
          {day.milestones.map((milestone) => {
            return <b key={milestone.milestoneId}>{milestone.name}</b>;
          })}
        </>
      ) : (
        <span className={system.fileMeta}>No milestone</span>
      )}
    </div>
  );
}

function _dayPrints(
  props: Readonly<Props>,
  files: readonly UploadFileDto[],
  canSelect: boolean,
): ReactNode {
  return (
    <div className={clsx(system.pile, system.uploadDayBody, classes.dayBody)}>
      {files.map((file) => {
        return (
          <UploadPrint
            key={file.fileId}
            file={file}
            localFile={props.snapshot.filesById.get(file.fileId)}
            activity={props.snapshot.fileActivityById.get(file.fileId)}
            previews={props.previews}
            selected={
              canSelect &&
              file.state !== "refused" &&
              file.state !== "cancelled"
                ? props.snapshot.selectedFileIds.has(file.fileId)
                : undefined
            }
            labelCount={_getLabelCountFromFile(props.snapshot, file.fileId)}
            onSelect={
              canSelect
                ? () => {
                    return props.controller.toggleFile(file.fileId);
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

function _dayReveal(
  fileCount: number,
  visibleCount: number,
  onReveal: () => void,
): ReactNode {
  return visibleCount < fileCount ? (
    <div className={classes.more}>
      <span className={system.fileMeta}>
        and {fileCount - visibleCount} more from the same day. Ticking the day
        takes all eligible files.
      </span>
      <Button variant="default" size="sm" onClick={onReveal}>
        Show all {fileCount}
      </Button>
    </div>
  ) : null;
}

function _dayHeader(
  props: Readonly<Props>,
  files: readonly UploadFileDto[],
  canSelect: boolean,
): ReactNode {
  const date = new Date(`${props.day.capturedOn}T12:00:00Z`);
  const eligible = files.filter((file) => {
    return file.state !== "refused" && file.state !== "cancelled";
  });
  const tickedCount = eligible.filter((file) => {
    return props.snapshot.selectedFileIds.has(file.fileId);
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
        {props.day.fileCount.toLocaleString("en-GB")}
      </span>
      {_daySelection(props, tickedCount, eligible.length, canSelect)}
    </div>
  );
}

function _daySelection(
  props: Readonly<Props>,
  tickedCount: number,
  eligibleCount: number,
  canSelect: boolean,
): ReactNode {
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
            return props.controller.selectDay(props.day.capturedOn);
          }}
        >
          Tick all {eligibleCount}
        </Button>
      ) : null}
    </span>
  );
}

function _getLabelCountFromFile(
  snapshot: UploadSnapshot,
  fileId: string,
): number {
  return (
    snapshot.detail?.edits.filter((edit) => {
      return (
        edit.undoneAt === null &&
        snapshot.editTargets.get(edit.editId)?.includes(fileId)
      );
    }).length ?? 0
  );
}
