import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { type ReactNode } from "react";
type Props = {
  snapshot: Readonly<UploadSnapshot>;
};

function _getUndatedFilesFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): UploadFileDto[] {
  const undatedIds = new Set(
    snapshot.detail?.undated?.files.map((file) => {
      return file.fileId;
    }),
  );
  return (
    snapshot.detail?.files.filter((file) => {
      return undatedIds.has(file.fileId) && file.state === "waiting";
    }) ?? []
  );
}

/** Lists the original filenames awaiting a capture day. */
export function UploadUndatedFilenames({
  snapshot,
}: Readonly<Props>): ReactNode {
  return (
    <ul>
      {_getUndatedFilesFromSnapshot(snapshot).map((file) => {
        return <li key={file.fileId}>{file.originalFilename}</li>;
      })}
    </ul>
  );
}
