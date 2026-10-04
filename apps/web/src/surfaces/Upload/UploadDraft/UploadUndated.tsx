import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { useRef, useState, type ReactNode } from "react";
import { UploadUndatedSheet } from "./UploadUndatedSheet";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };
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

/** Optional correction for undated rows; all accepted files may still go up. */
export function UploadUndated({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const [capturedOn, setCapturedOn] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const files = _getUndatedFilesFromSnapshot(snapshot);
  const onSubmit = async () => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setIsPending(true);
    setError(undefined);
    try {
      await controller.amendDates(
        files.map((file) => {
          return { fileId: file.fileId, capturedOn };
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  };
  return files.length === 0 ? null : (
    <UploadUndatedSheet
      options={{
        snapshot,
        count: files.length,
        form: {
          capturedOn,
          error,
          isPending,
          onDateChange: setCapturedOn,
          onSubmit,
        },
      }}
    />
  );
}
