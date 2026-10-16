import { ICON_PROPS_SMALL } from "@/system/icons";
import { IconCheck, IconLock, IconTag } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { Props as PrintProps } from "../Print.types";
import classes from "./PrintOverlays.module.css";
import { PrintRuntime } from "./PrintRuntime/PrintRuntime";

type Props = Pick<PrintProps, "restrictedLabel" | "unseen" | "labelCount"> & {
  durationMs: number | undefined;
  isSelected: boolean | undefined;
};

/**
 * Carries access, seen, selection and saved-label status with the photograph.
 */
export function PrintOverlays({
  durationMs,
  restrictedLabel,
  unseen,
  isSelected,
  labelCount,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <PrintRuntime durationMs={durationMs} />
      {restrictedLabel === undefined ? null : (
        <span className={classes.printOverlaysRestricted}>
          <IconLock {...ICON_PROPS_SMALL} />
          {restrictedLabel}
        </span>
      )}
      {unseen ? (
        <span className={classes.printOverlaysUnseen}>
          <span className="visually-hidden">Not seen yet</span>
        </span>
      ) : null}
      {isSelected === true ? (
        <span className={classes.printOverlaysTick} aria-hidden="true">
          <IconCheck size="1.15rem" stroke={2.5} />
        </span>
      ) : null}
      {labelCount === undefined || labelCount === 0 ? null : (
        <span className={classes.printOverlaysLabels}>
          <IconTag size="0.85rem" stroke={2} />
          {labelCount}
        </span>
      )}
    </>
  );
}
