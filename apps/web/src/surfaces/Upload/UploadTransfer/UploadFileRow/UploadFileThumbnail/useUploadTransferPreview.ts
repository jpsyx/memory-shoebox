import type {
  UploadPreview,
  UploadPreviewQueue,
  UploadPreviewInput,
} from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

const _subscribeToNothing = (): (() => void) => {
  return () => {};
};

/** Transfer rows own viewport requests separately from the day-group prints. */
export function useUploadTransferPreview({
  file,
  localFile,
  previews,
}: Readonly<{
  file: UploadFileDto;
  localFile?: File;
  previews?: UploadPreviewQueue;
}>): {
  holder: RefObject<HTMLDivElement | null>;
  preview: UploadPreview | undefined;
} {
  const holder = useRef<HTMLDivElement>(null);
  const previewId = `transfer:${file.fileId}`;
  const preview = useSyncExternalStore(
    previews?.subscribe ?? _subscribeToNothing,
    () => {
      return previews?.getPreview(previewId);
    },
  );
  const { declaredContentType, media } = file;
  useEffect(() => {
    if (!holder.current || !localFile || !previews || media) return;
    return _observePreview(holder.current, previews, {
      fileId: previewId,
      file: localFile,
      contentType: declaredContentType,
    });
  }, [localFile, previews, previewId, declaredContentType, media]);
  return { holder, preview };
}

function _observePreview(
  holder: Element,
  previews: UploadPreviewQueue,
  input: UploadPreviewInput,
): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          previews.requestPreview(input);
        } else previews.deactivate(input.fileId);
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
