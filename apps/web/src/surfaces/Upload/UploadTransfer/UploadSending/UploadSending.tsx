import { Sheet } from "@/system/Chrome/Sheet";
import classes from "@/system/system.module.css";
import { Prose } from "@/system/typography/Prose";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadFileRow } from "../UploadFileRow/UploadFileRow";
import { UploadProgress } from "../UploadProgress";
type Props = { snapshot: UploadSnapshot };
function _getVisibleFilesFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): Array<import("@memory-shoebox/shared").UploadFileDto> {
  const files = snapshot.detail!.files;
  const active = files.filter((file) => {
    const activity = snapshot.fileActivityById.get(file.fileId);
    return (
      activity?.kind === "preparing" ||
      activity?.kind === "transferring" ||
      file.state === "sending"
    );
  });
  const activeIds = new Set(
    active.map((file) => {
      return file.fileId;
    }),
  );
  const completed = files
    .filter((file) => {
      return !activeIds.has(file.fileId) && file.state === "done";
    })
    .slice(-Math.max(0, 12 - active.length));
  const occupied = new Set(
    [...active, ...completed].map((file) => {
      return file.fileId;
    }),
  );
  const waiting = files.filter((file) => {
    return !occupied.has(file.fileId);
  });
  return [...active, ...completed, ...waiting].slice(0, 12);
}

/** A bounded active row preview sits beneath authoritative batch progress. */
export function UploadSending({ snapshot }: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  return (
    <Sheet wide label="What is going up">
      <Stack gap="sm">
        <UploadProgress detail={detail} />
        <div className={classes.fileList}>
          {_getVisibleFilesFromSnapshot(snapshot).map((file) => {
            return (
              <UploadFileRow
                key={file.fileId}
                file={file}
                activity={snapshot.fileActivityById.get(file.fileId)}
                isDisabled
              />
            );
          })}
        </div>
        {detail.files.length > 12 ? (
          <Prose>
            and {detail.files.length - 12} more, across {detail.days.length}{" "}
            days
          </Prose>
        ) : null}
      </Stack>
    </Sheet>
  );
}
