import { Prose } from "@/system/typography/Prose";
import { useUploadPreviewQueue } from "@/upload/UploadSessionProvider/useUploadPreviewQueue";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { getManifestEntryFromFile } from "@/upload/getManifestEntryFromFile/getManifestEntryFromFile";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import classes from "./UploadIncomingOriginal.module.css";
type Props = { clientRef: string; snapshot: UploadSnapshot };
function useIncomingCaptureDate(
  options: Readonly<{ file?: File; clientRef: string }>,
): string | undefined {
  const { file, clientRef } = options;
  const [capturedAt, setCapturedAt] = useState<string>();
  useEffect(
    function readIncomingCaptureDate() {
      let isCurrent = true;
      if (file) {
        void getManifestEntryFromFile({ file, clientRef })
          .then((entry) => {
            if (isCurrent) {
              setCapturedAt(entry.capturedAt ?? undefined);
            }
          })
          .catch(() => {});
      }
      return () => {
        isCurrent = false;
      };
    },
    [file, clientRef],
  );
  return capturedAt;
}

function useIncomingOriginalPreview({ clientRef, snapshot }: Readonly<Props>): {
  preview:
    | import("@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types").UploadPreview
    | undefined;
  capturedAt?: string;
} {
  const pick = snapshot.recoveryFilesByRef?.get(clientRef);
  const previews = useUploadPreviewQueue();
  const preview = useSyncExternalStore(previews.subscribe, () => {
    return previews.getPreview(clientRef);
  });
  const capturedAt = useIncomingCaptureDate({ file: pick?.file, clientRef });
  useEffect(
    function previewIncomingOriginal() {
      if (pick) {
        previews.requestPreview({
          fileId: clientRef,
          file: pick.file,
          contentType: pick.file.type,
        });
      }
      return () => {
        previews.release(clientRef);
      };
    },
    [pick, clientRef, previews],
  );
  return { preview, capturedAt };
}

/**
 * Identifies one incoming original using the existing disposable preview
 * queue.
 */
export function UploadIncomingOriginal({
  clientRef,
  snapshot,
}: Readonly<Props>): ReactNode {
  const pick = snapshot.recoveryFilesByRef?.get(clientRef);
  const { preview, capturedAt } = useIncomingOriginalPreview({
    clientRef,
    snapshot,
  });
  return (
    <div>
      <Prose onPanel={snapshot.detail?.state === "draft"}>
        Chosen file {pick?.ordinal ?? "unknown"} of {snapshot.checkingTotal}:{" "}
        {pick?.file.name ?? "Original unavailable; choose it again"}
      </Prose>
      <Prose onPanel={snapshot.detail?.state === "draft"}>
        {capturedAt
          ? `Capture metadata: ${capturedAt}`
          : "Capture metadata unavailable."}
      </Prose>
      {preview?.kind === "ready" ? (
        <img
          className={classes.uploadIncomingOriginalRecoveryPreview}
          src={preview.url}
          width={preview.width}
          height={preview.height}
          alt={`Chosen original: ${pick?.file.name}`}
        />
      ) : (
        <Prose onPanel={snapshot.detail?.state === "draft"}>
          Preview unavailable. Use the selected-file order and capture metadata,
          or skip and choose again.
        </Prose>
      )}
    </div>
  );
}
