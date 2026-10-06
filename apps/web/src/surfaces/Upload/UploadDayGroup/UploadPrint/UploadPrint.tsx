import type {
  UploadPreview,
  UploadPreviewInput,
  UploadPreviewQueue,
} from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type { UploadFileActivity } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { PixelSize } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";
import type { UploadFileDto } from "@memory-shoebox/shared";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import classes from "./UploadPrint.module.css";
import { UploadPrintBody } from "./UploadPrintBody/UploadPrintBody";

type Props = {
  file: UploadFileDto;
  localFile?: File;
  activity?: UploadFileActivity;
  previews: UploadPreviewQueue;
  selected?: boolean;
  labelCount: number;
  onSelect?: () => void;
};

function useLearnedPreviewSize({
  fileId,
  preview,
}: Readonly<{ fileId: string; preview: UploadPreview | undefined }>):
  | PixelSize
  | undefined {
  const [learnedSize, setLearnedSize] = useState<
    (PixelSize & { fileId: string }) | undefined
  >();
  const size = preview?.kind === "ready" ? preview : preview?.size;
  useEffect(
    function rememberPreviewSize() {
      if (size) {
        setLearnedSize({ fileId, width: size.width, height: size.height });
      }
    },
    [fileId, size],
  );
  return size ?? (learnedSize?.fileId === fileId ? learnedSize : undefined);
}

function useObservedPreview({ file, localFile, previews }: Readonly<Props>): {
  holder: RefObject<HTMLDivElement | null>;
  preview: UploadPreview | undefined;
} {
  const holder = useRef<HTMLDivElement>(null);
  const preview = useSyncExternalStore(previews.subscribe, () => {
    return previews.getPreview(file.fileId);
  });
  const { fileId, declaredContentType, media } = file;
  useEffect(
    function observeVisibleUploadPreview() {
      if (!holder.current || !localFile || media) {
        return;
      }
      return _observePreview({
        holder: holder.current,
        input: { fileId, file: localFile, contentType: declaredContentType },
        previews: previews,
      });
    },
    [fileId, declaredContentType, media, localFile, previews],
  );
  return { holder, preview };
}

function _observePreview({
  holder,
  input,
  previews,
}: Readonly<{
  holder: HTMLDivElement;
  input: UploadPreviewInput;
  previews: UploadPreviewQueue;
}>): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          previews.requestPreview(input);
        } else {
          previews.release(input.fileId);
        }
      });
    },
    { rootMargin: "300px" },
  );
  observer.observe(holder);
  return () => {
    observer.disconnect();
    previews.release(input.fileId);
  };
}

function _activityLabel({
  file,
  activity,
}: Readonly<{
  file: Readonly<UploadFileDto>;
  activity: UploadFileActivity | undefined;
}>): string {
  if (activity?.kind === "preparing") {
    return "Preparing";
  }
  if (activity?.kind === "transferring") {
    return "Sending";
  }
  if (activity?.kind === "unconfirmed") {
    return "Not confirmed up";
  }
  if (activity?.kind === "duplicate") {
    return "Duplicate pick";
  }
  const state = activity?.kind === "confirmed" ? activity.state : file.state;
  return {
    waiting: "Waiting",
    sending: "Sending",
    done: "Up",
    failed: "Did not arrive",
    refused: "Refused",
    cancelled: "Cancelled",
  }[state];
}

/**
 * A local or landed print with an enabled filename fallback for decode loss.
 */
export function UploadPrint({
  file,
  localFile,
  activity,
  previews,
  selected,
  labelCount,
  onSelect,
}: Readonly<Props>): ReactNode {
  const props = {
    file,
    localFile,
    activity,
    previews,
    selected,
    labelCount,
    onSelect,
  };
  const { holder, preview } = useObservedPreview(props);
  const size = useLearnedPreviewSize({
    fileId: file.fileId,
    preview: preview,
  });
  return (
    <div ref={holder} className={classes.uploadPrintHolder}>
      <UploadPrintBody
        file={file}
        hasLocalFile={localFile !== undefined}
        selected={selected}
        onSelect={onSelect}
        labelCount={labelCount}
        preview={preview}
        size={size}
      />
      {activity || file.state !== "waiting" ? (
        <span className={classes.uploadPrintActivity}>
          {_activityLabel({ file: file, activity: activity })}
        </span>
      ) : null}
    </div>
  );
}
