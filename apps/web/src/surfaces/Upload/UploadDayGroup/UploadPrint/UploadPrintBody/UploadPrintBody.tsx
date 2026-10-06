import { Print } from "@/system/Pile/Print";
import { scatterStyle } from "@/system/Pile/scatterStyle";
import system from "@/system/system.module.css";
import type { UploadPreview } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type { PixelSize } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { clsx } from "clsx";
import { type ReactNode } from "react";
import { UploadPrintMarkers } from "./UploadPrintMarkers";
import { UploadPrintPreview } from "./UploadPrintPreview/UploadPrintPreview";
type Props = {
  file: UploadFileDto;
  selected?: boolean;
  onSelect?: () => void;
  labelCount: number;
  preview: UploadPreview | undefined;
  size: PixelSize | undefined;
  hasLocalFile: boolean;
};

/** Shows a landed print or a selectable local original. */
export function UploadPrintBody({
  file,
  selected,
  onSelect,
  labelCount,
  preview,
  size,
  hasLocalFile,
}: Readonly<Props>): ReactNode {
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
      <UploadPrintPreview
        file={file}
        preview={preview}
        hasLocalFile={hasLocalFile}
      />
      <UploadPrintMarkers selected={selected} labelCount={labelCount} />
    </button>
  );
}
