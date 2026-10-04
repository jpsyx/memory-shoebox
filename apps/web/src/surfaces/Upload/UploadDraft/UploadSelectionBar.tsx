import { IconFlag, IconTag, IconUser, IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ICON_PROPS_SMALL } from "@/system/icons";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import classes from "@/system/system.module.css";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onOpenLabel: (kind: "tag" | "person") => void;
  onOpenMilestone: () => void;
};
type SelectionActionOptions = {
  label: string;
  icon: ReactNode;
  isDisabled: boolean;
  onClick: () => void;
};
function _selectionAction(
  options: Readonly<SelectionActionOptions>,
): ReactNode {
  return (
    <button
      type="button"
      disabled={options.isDisabled}
      className={classes.selectionButton}
      onClick={options.onClick}
    >
      {options.icon}
      {options.label}
    </button>
  );
}
/** A sticky edit toolbar; these ticks never choose which files go up. */
export function UploadSelectionBar({
  snapshot,
  controller,
  onOpenLabel,
  onOpenMilestone,
}: Readonly<Props>): ReactNode {
  const count = snapshot.selectedFileIds.size;
  const action = (label: string, icon: ReactNode, onClick: () => void) => {
    return _selectionAction({
      label,
      icon,
      isDisabled: snapshot.isBusy,
      onClick,
    });
  };
  return count === 0 ? null : (
    <div className={classes.selectionBar} aria-label="Edit ticked files">
      <span className={classes.selectionCount}>
        {count}
        <small>ticked</small>
      </span>
      {action("Add a tag", <IconTag {...ICON_PROPS_SMALL} />, () => {
        onOpenLabel("tag");
      })}
      {action("Tag somebody", <IconUser {...ICON_PROPS_SMALL} />, () => {
        onOpenLabel("person");
      })}
      {action(
        "Put under a milestone",
        <IconFlag {...ICON_PROPS_SMALL} />,
        onOpenMilestone,
      )}
      <span className={classes.selectionEnd}>
        {action("Tick everything", null, controller.selectAll)}
        {action(
          "Untick",
          <IconX {...ICON_PROPS_SMALL} />,
          controller.clearSelection,
        )}
      </span>
    </div>
  );
}
