import { useState, type ReactNode } from "react";
import { Print } from "@/system/Pile/Print";
import type { MilestoneAttachmentEntry } from "../../../../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
import classes from "./MilestonePickerPrint.module.css";

type Props = {
  entry: MilestoneAttachmentEntry;
  seed: number;
  onToggle: (itemId: string) => void;
};

/** Keeps a returned photograph selectable when its thumbnail cannot be read. */
export function MilestonePickerPrint({
  entry: { item, isAttached },
  seed,
  onToggle,
}: Readonly<Props>): ReactNode {
  const [failedSource, setFailedSource] = useState<string>();
  const toggle = () => {
    onToggle(item.itemId);
  };
  if (failedSource === item.media.thumb.url) {
    return (
      <button
        type="button"
        className={classes.milestonePickerPrintUnavailable}
        aria-label={`Unavailable photograph: ${item.media.altText}`}
        aria-pressed={isAttached}
        onClick={toggle}
      >
        Photograph unavailable.
      </button>
    );
  }
  return (
    <div
      onErrorCapture={() => {
        setFailedSource(item.media.thumb.url);
      }}
    >
      <Print
        media={item.media}
        seed={seed}
        selected={isAttached}
        onClick={toggle}
      />
    </div>
  );
}
