import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import { UploadFileRow } from "./UploadFileRow";
import { UploadProgress } from "./UploadProgress";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
import classes from "@/system/system.module.css";
type Props = { snapshot: UploadSnapshot };
/** A bounded active row preview sits beneath authoritative batch progress. */
export function UploadSending({ snapshot }: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  return (
    <Sheet wide label="What is going up">
      <Stack gap="sm">
        <UploadProgress detail={detail} />
        <div className={classes.fileList}>
          {detail.files.slice(0, 12).map((file) => {
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
