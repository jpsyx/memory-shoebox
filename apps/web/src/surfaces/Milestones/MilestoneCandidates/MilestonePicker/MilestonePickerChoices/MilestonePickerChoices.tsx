import type { CSSProperties, ReactNode } from "react";
import { Print } from "@/system/Pile/Print";
import type { MilestoneAttachment } from "../../../useMilestoneAttachment/useMilestoneAttachment.types";
import classes from "./MilestonePickerChoices.module.css";
type Props = { picker: MilestoneAttachment };
/** Each print toggles only its own returned identity. */
export function MilestonePickerChoices({ picker }: Readonly<Props>): ReactNode {
  return (
    <div
      className={classes.milestonePickerChoicesPrints}
      aria-busy={picker.isPending}
    >
      {picker.entries.map(({ item, isAttached }, index) => {
        return (
          <div
            key={item.itemId}
            className={classes.milestonePickerChoicesFrame}
            style={
              {
                "--milestone-print-width": `${(10 * item.media.thumb.width) / item.media.thumb.height}rem`,
              } as CSSProperties
            }
          >
            <Print
              media={item.media}
              seed={index}
              selected={isAttached}
              onClick={() => {
                picker.toggle(item.itemId);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
