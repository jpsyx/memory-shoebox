import type { CSSProperties, ReactNode } from "react";
import type { MilestoneAttachment } from "../../../useMilestoneAttachment/useMilestoneAttachment.types";
import { MilestonePickerPrint } from "./MilestonePickerPrint/MilestonePickerPrint";
import classes from "./MilestonePickerChoices.module.css";
type Props = { picker: MilestoneAttachment };
/** Each print toggles only its own returned identity. */
export function MilestonePickerChoices({ picker }: Readonly<Props>): ReactNode {
  return (
    <div
      className={classes.milestonePickerChoicesPrints}
      aria-busy={picker.isPending}
    >
      {picker.entries.map((entry, index) => {
        const { item } = entry;
        return (
          <div
            key={item.itemId}
            className={classes.milestonePickerChoicesFrame}
            style={
              {
                "--milestone-print-width": `${(10 * item.media.width) / item.media.height}rem`,
              } as CSSProperties
            }
          >
            <MilestonePickerPrint
              entry={entry}
              seed={index}
              onToggle={picker.toggle}
            />
          </div>
        );
      })}
    </div>
  );
}
