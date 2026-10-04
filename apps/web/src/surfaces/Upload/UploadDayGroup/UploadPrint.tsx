import { IconCheck, IconPhoto, IconTag, IconVideo } from "@tabler/icons-react";
import { clsx } from "clsx";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { Print } from "@/system/Pile/Print";
import { scatterStyle } from "@/system/Pile/scatterStyle";
import type { UploadFileActivity } from "@/upload/uploadSessionController/uploadSessionController.types";
import type {
  UploadPreview,
  UploadPreviewQueue,
  UploadPreviewInput,
} from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import system from "@/system/system.module.css";
import classes from "../upload.module.css";

type Props = {
  file: UploadFileDto;
  localFile?: File;
  activity?: UploadFileActivity;
  previews: UploadPreviewQueue;
  selected?: boolean;
  labelCount: number;
  onSelect?: () => void;
};

/** A local or landed print with an enabled filename fallback for decode loss. */
export function UploadPrint(props: Readonly<Props>): ReactNode {
  const { holder, preview } = useObservedPreview(props);
  return (
    <div ref={holder} className={classes.printHolder}>
      {_drawPrint(props, preview)}
      {props.activity || props.file.state !== "waiting" ? (
        <span className={classes.activity}>
          {_activityLabel(props.file, props.activity)}
        </span>
      ) : null}
    </div>
  );
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
  useEffect(() => {
    if (!holder.current || !localFile || media) {
      return;
    }
    return _observePreview(
      holder.current,
      { fileId, file: localFile, contentType: declaredContentType },
      previews,
    );
  }, [fileId, declaredContentType, media, localFile, previews]);
  return { holder, preview };
}

function _observePreview(
  holder: HTMLDivElement,
  input: UploadPreviewInput,
  previews: UploadPreviewQueue,
): () => void {
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

function _drawPrint(
  props: Readonly<Props>,
  preview: UploadPreview | undefined,
): ReactNode {
  const { file, selected, onSelect, labelCount } = props;
  if (file.media) {
    return (
      <Print
        media={{ ...file.media, altText: file.originalFilename }}
        seed={file.position}
        selected={selected}
        onClick={onSelect}
        labelCount={labelCount}
      />
    );
  }
  const size = preview?.kind === "ready" ? preview : preview?.size;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        system.print,
        selected !== undefined && system.printSelectable,
        selected && system.printSelected,
      )}
      style={{
        ...scatterStyle(file.position),
        aspectRatio: size ? `${size.width} / ${size.height}` : "4 / 3",
      }}
    >
      {_previewContent(file, preview)}
      {_printMarkers(selected, labelCount)}
    </button>
  );
}

function _previewContent(
  file: Readonly<UploadFileDto>,
  preview: UploadPreview | undefined,
): ReactNode {
  const MediaIcon = file.declaredContentType.startsWith("video/")
    ? IconVideo
    : IconPhoto;
  return (
    <>
      {preview?.kind === "ready" ? (
        <img
          src={preview.url}
          alt={file.originalFilename}
          width={preview.width}
          height={preview.height}
        />
      ) : (
        <span className={classes.fallback}>
          <MediaIcon size="1.5rem" aria-hidden="true" />
          <span>{file.originalFilename}</span>
          <span className={classes.previewCopy}>
            {preview?.kind === "preparing"
              ? "Preparing preview"
              : "Preview unavailable"}
          </span>
        </span>
      )}
    </>
  );
}

function _printMarkers(
  selected: boolean | undefined,
  labelCount: number,
): ReactNode {
  return (
    <>
      {selected ? (
        <span className={system.printTick} aria-hidden="true">
          <IconCheck size="1.15rem" />
        </span>
      ) : null}
      {labelCount > 0 ? (
        <span className={system.printLabels}>
          <IconTag size="0.85rem" aria-hidden="true" />
          <span className="visually-hidden">
            {labelCount} saved {labelCount === 1 ? "label" : "labels"}
          </span>
          {labelCount}
        </span>
      ) : null}
    </>
  );
}

function _activityLabel(
  file: Readonly<UploadFileDto>,
  activity: UploadFileActivity | undefined,
): string {
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
