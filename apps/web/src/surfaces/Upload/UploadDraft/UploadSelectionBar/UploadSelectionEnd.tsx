import { ICON_PROPS_SMALL } from "@/system/icons";
import classes from "@/system/system.module.css";
import type { UploadSessionController } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { UploadSelectionAction } from "./UploadSelectionAction";
type Props = { controller: UploadSessionController; isBusy: boolean };
/** Selects or clears every waiting row from the bulk edit toolbar. */
export function UploadSelectionEnd({
  controller,
  isBusy,
}: Readonly<Props>): ReactNode {
  return (
    <span className={classes.selectionEnd}>
      <UploadSelectionAction
        label="Tick everything"
        isDisabled={isBusy}
        onClick={controller.selectAll}
      />
      <UploadSelectionAction
        label="Untick"
        icon=<IconX {...ICON_PROPS_SMALL} />
        isDisabled={isBusy}
        onClick={controller.clearSelection}
      />
    </span>
  );
}
