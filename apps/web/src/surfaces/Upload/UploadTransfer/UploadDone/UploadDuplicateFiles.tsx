import classes from "@/system/system.module.css";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { ReactNode } from "react";
import { UploadFileRow } from "../UploadFileRow/UploadFileRow";

type Props = { snapshot: UploadSnapshot };

/** Keeps skipped duplicates visible in a draft, finished batch or reload. */
export function UploadDuplicateFiles({ snapshot }: Readonly<Props>): ReactNode {
  const duplicates = snapshot.detail!.files.filter((file) => {
    return (
      file.duplicateReason ||
      snapshot.fileActivityById.get(file.fileId)?.kind === "duplicate"
    );
  });
  return duplicates.length > 0 ? (
    <div className={classes.fileList}>
      {duplicates.map((file) => {
        return (
          <UploadFileRow
            key={file.fileId}
            file={file}
            activity={snapshot.fileActivityById.get(file.fileId)}
            isComplete={snapshot.detail?.state === "settled"}
            isDisabled
          />
        );
      })}
    </div>
  ) : null;
}
