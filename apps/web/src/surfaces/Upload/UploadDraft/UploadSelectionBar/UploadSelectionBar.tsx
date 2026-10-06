import { UploadSelectionEnd } from "./UploadSelectionEnd";
import { ICON_PROPS_SMALL } from "@/system/icons";
import classes from "@/system/system.module.css";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { IconFlag, IconTag, IconTrash, IconUser } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { UploadSelectionAction } from "./UploadSelectionAction";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onOpenLabel: (kind: "tag" | "person") => void;
  onOpenMilestone: () => void;
  onRemove?: (trigger: HTMLElement) => void;
};

/** A sticky edit toolbar; these ticks never choose which files go up. */
export function UploadSelectionBar({
  snapshot,
  controller,
  onOpenLabel,
  onOpenMilestone,
  onRemove,
}: Readonly<Props>): ReactNode {
  const selectedFileCount = snapshot.selectedFileIds.size;
  return selectedFileCount === 0 ? null : (
    <div className={classes.selectionBar} aria-label="Edit ticked files">
      <span className={classes.selectionCount}>
        {selectedFileCount}
        <small>ticked</small>
      </span>
      <UploadSelectionAction
        label="Add a tag"
        icon=<IconTag {...ICON_PROPS_SMALL} />
        isDisabled={snapshot.isBusy}
        onClick={() => {
          onOpenLabel("tag");
        }}
      />
      <UploadSelectionAction
        label="Tag somebody"
        icon=<IconUser {...ICON_PROPS_SMALL} />
        isDisabled={snapshot.isBusy}
        onClick={() => {
          onOpenLabel("person");
        }}
      />
      <UploadSelectionAction
        label="Put under a milestone"
        icon=<IconFlag {...ICON_PROPS_SMALL} />
        isDisabled={snapshot.isBusy}
        onClick={onOpenMilestone}
      />
      {onRemove ? (
        <UploadSelectionAction
          label="Remove"
          icon=<IconTrash {...ICON_PROPS_SMALL} />
          isDisabled={
            snapshot.isBusy ||
            Boolean(snapshot.hasUnconfirmedRemoval) ||
            snapshot.recoveryMatches.ambiguous.length > 0
          }
          onClick={(event) => {
            onRemove(event.currentTarget);
          }}
        />
      ) : null}
      <UploadSelectionEnd controller={controller} isBusy={snapshot.isBusy} />
    </div>
  );
}
