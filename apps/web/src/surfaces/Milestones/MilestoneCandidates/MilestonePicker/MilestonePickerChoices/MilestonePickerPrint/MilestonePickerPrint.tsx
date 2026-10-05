import { Print } from "@/system/Pile/Print";
import { useRef, useState, type ReactNode } from "react";
import type { MilestoneAttachmentEntry } from "../../../../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
import { MilestonePickerUnavailable } from "./MilestonePickerUnavailable/MilestonePickerUnavailable";
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
  const ownedFocus = useRef(false);
  const [failedSource, setFailedSource] = useState<string>();
  const toggle = () => {
    onToggle(item.itemId);
  };
  return failedSource === item.media.thumb.url ? (
    <MilestonePickerUnavailable
      item={item}
      isAttached={isAttached}
      ownedFocus={ownedFocus}
      onToggle={toggle}
    />
  ) : (
    <div
      onErrorCapture={(event) => {
        ownedFocus.current = event.currentTarget.contains(
          document.activeElement,
        );
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
