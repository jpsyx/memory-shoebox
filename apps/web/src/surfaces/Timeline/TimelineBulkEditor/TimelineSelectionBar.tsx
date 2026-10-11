import {
  IconFlag,
  IconTag,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { UploadSelectionAction } from "@/surfaces/Upload/UploadDraft/UploadSelectionBar/UploadSelectionAction";
import { ICON_PROPS_SMALL } from "@/system/icons";
import classes from "@/system/system.module.css";
import local from "./TimelineBulkEditor.module.css";
import { useTimelineToolbarTop } from "./useTimelineToolbarTop";
import type { TimelineBulkChoice } from "./TimelineBulkDialog";

type Props = {
  count: number;
  isBusy: boolean;
  onOpen: (kind: TimelineBulkChoice["kind"]) => void;
  onTickLoaded: () => void;
  onClear: () => void;
  onFinish: () => void;
};

/** Upload's exact action controls, wrapped into two columns on phones. */
export function TimelineSelectionBar(props: Readonly<Props>): ReactNode {
  const disabled = props.isBusy || props.count === 0;
  const top = useTimelineToolbarTop();
  return (
    <div
      className={`${classes.selectionBar} ${local.toolbar}`}
      style={{ top }}
      role="region"
      aria-label="Edit ticked photos"
      aria-busy={props.isBusy}
    >
      <span
        className={`${classes.selectionCount} ${local.count}`}
        aria-live="polite"
      >
        {props.count}
        <small>ticked</small>
      </span>
      <BulkActions isDisabled={disabled} onOpen={props.onOpen} />
      <SelectionControls {...props} />
    </div>
  );
}

function BulkActions(
  props: Readonly<{
    isDisabled: boolean;
    onOpen: Props["onOpen"];
  }>,
): ReactNode {
  return (
    <div className={local.actions}>
      {(
        [
          { kind: "tag", label: "Add a tag", Icon: IconTag },
          { kind: "person", label: "Tag somebody", Icon: IconUser },
          {
            kind: "milestone",
            label: "Put under a milestone",
            Icon: IconFlag,
          },
          { kind: "delete", label: "Delete", Icon: IconTrash },
        ] as const
      ).map(({ kind, label, Icon }) => {
        return (
          <UploadSelectionAction
            key={kind}
            label={label}
            icon={<Icon {...ICON_PROPS_SMALL} />}
            isDisabled={props.isDisabled}
            onClick={() => {
              props.onOpen(kind);
            }}
          />
        );
      })}
    </div>
  );
}

function SelectionControls(props: Readonly<Props>): ReactNode {
  return (
    <>
      <div className={`${classes.selectionEnd} ${local.selectionEnd}`}>
        <UploadSelectionAction
          label="Tick loaded photos"
          isDisabled={props.isBusy}
          onClick={props.onTickLoaded}
        />
        <UploadSelectionAction
          label="Untick"
          isDisabled={props.isBusy || props.count === 0}
          onClick={props.onClear}
        />
      </div>
      <div className={local.finish}>
        <UploadSelectionAction
          label="Done selecting"
          icon={<IconX {...ICON_PROPS_SMALL} />}
          isDisabled={props.isBusy}
          onClick={props.onFinish}
        />
      </div>
    </>
  );
}
