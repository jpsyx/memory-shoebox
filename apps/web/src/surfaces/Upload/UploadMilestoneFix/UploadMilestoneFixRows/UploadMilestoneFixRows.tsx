import { dayLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";
import { TextInput } from "@mantine/core";
import type { UploadMismatchGroup } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { useUploadMilestoneFix } from "../useUploadMilestoneFix";
import uploadClasses from "./UploadMilestoneFixRows.module.css";
type Props = {
  group: UploadMismatchGroup;
  form: ReturnType<typeof useUploadMilestoneFix>;
  isLocked: boolean;
};
/** Filename and capture day stand in for not-yet-landed media previews. */
export function UploadMilestoneFixRows({
  group,
  form,
  isLocked,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.fileList}>
      {group.files.map((file) => {
        return (
          <div
            key={file.fileId}
            className={uploadClasses.uploadMilestoneFixRowsMismatchRow}
          >
            <span>
              <span className={classes.fileName}>{file.originalFilename}</span>
              <br />
              <span className={classes.fileMeta}>
                Taken {dayLabel(file.capturedOn)}
              </span>
            </span>
            {form.isSpan ? (
              <TextInput
                type="date"
                aria-label={`Which day ${file.originalFilename} belongs to`}
                min={group.milestone.startsOn}
                max={group.milestone.endsOn}
                value={form.days[file.fileId] ?? ""}
                onChange={(event) => {
                  return form.onDayChange({
                    fileId: file.fileId,
                    day: event.currentTarget.value,
                  });
                }}
                disabled={isLocked}
              />
            ) : (
              <span className={classes.fileMeta}>
                Becomes {dayLabel(group.milestone.startsOn)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
