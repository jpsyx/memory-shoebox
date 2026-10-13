import type {
  UploadPreviewQueue,
  UploadPreview,
} from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

/** Observes review thumbnails separately from day-group preview ownership. */
export function useUploadDateThumbnail({
  file,
  localFile,
  previews,
}: Readonly<{
  file: UploadFileDto;
  localFile?: File;
  previews: UploadPreviewQueue;
}>): {
  holder: RefObject<HTMLElement | null>;
  preview: UploadPreview | undefined;
} {
  const holder = useRef<HTMLElement>(null);
  const previewId = `date-review:${file.fileId}`;
  const preview = useSyncExternalStore(previews.subscribe, () => {
    return previews.getPreview(previewId);
  });
  useEffect(() => {
    if (!holder.current || !localFile) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            previews.requestPreview({
              fileId: previewId,
              file: localFile,
              contentType: file.declaredContentType,
            });
          } else {
            previews.deactivate(previewId);
          }
        });
      },
      { rootMargin: "300px" },
    );
    observer.observe(holder.current);
    return () => {
      observer.disconnect();
      previews.release(previewId);
    };
  }, [localFile, previews, previewId, file.declaredContentType]);
  return { holder, preview };
}
