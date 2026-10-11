import { useRef, useState, type ReactNode, type RefObject } from "react";
import {
  BULK_EDIT_MAX_ITEMS,
  type BulkEditItemsRequest,
  type TimelineDay,
} from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import {
  PileSelectionContext,
  type PileSelection,
} from "@/system/Pile/PileSelection/PileSelection";
import { TimelineSelectionBar } from "./TimelineSelectionBar";
import {
  TimelineBulkDialog,
  type TimelineBulkChoice,
} from "./TimelineBulkDialog";
import { useTimelineSelection } from "./useTimelineSelection";
import classes from "./TimelineBulkEditor.module.css";
import { TimelineSelectionHeaderButton } from "./TimelineSelectionHeaderButton";

type Props = {
  days: readonly TimelineDay[];
  filterSelection: TimelineSelection;
  children: ReactNode;
  onChanged: () => void;
};

type SelectionState = ReturnType<typeof useTimelineSelection>;
type EditorControls = {
  choice: TimelineBulkChoice | undefined;
  notice: string | undefined;
  selectButton: RefObject<HTMLButtonElement | null>;
  onFinish: () => void;
  onClose: () => void;
  onSaved: (body: BulkEditItemsRequest) => void;
  onReview: () => void;
  onStart: () => void;
  onOpen: (kind: TimelineBulkChoice["kind"]) => void;
};
type LifecycleOptions = {
  selection: SelectionState;
  onChanged: () => void;
  onClose: () => void;
  setNotice: (notice: string | undefined) => void;
};

function _makeLifecycleHandlers(
  options: Readonly<LifecycleOptions>,
): Pick<EditorControls, "onSaved" | "onReview"> {
  const finish = (notice: string) => {
    options.selection.finish();
    options.onChanged();
    options.setNotice(notice);
    options.onClose();
  };
  return {
    onSaved: (body) => {
      finish(
        body.action === "delete"
          ? `${body.itemIds.length} photos and videos deleted.`
          : `Updated ${body.itemIds.length} photos and videos.`,
      );
    },
    onReview: () => {
      finish("Review the refreshed timeline before selecting photos again.");
    },
  };
}

function useEditorControls(
  options: Readonly<{
    selection: SelectionState;
    onChanged: () => void;
  }>,
): EditorControls {
  const [choice, setChoice] = useState<TimelineBulkChoice>();
  const [notice, setNotice] = useState<string>();
  const selectButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = () => {
    requestAnimationFrame(() => {
      selectButton.current?.focus();
    });
  };
  const onClose = () => {
    setChoice(undefined);
    restoreFocus();
  };
  return {
    choice,
    notice,
    selectButton,
    onFinish: () => {
      options.selection.finish();
      restoreFocus();
    },
    onClose,
    ..._makeLifecycleHandlers({ ...options, onClose, setNotice }),
    onStart: () => {
      setNotice(undefined);
      options.selection.start();
    },
    onOpen: (kind) => {
      setChoice({ kind, itemIds: [...options.selection.selectedItemIds] });
    },
  };
}

function _renderControls(
  options: Readonly<{
    editor: EditorControls;
    selection: SelectionState;
  }>,
): ReactNode {
  const { editor, selection } = options;
  if (!selection.isSelecting && !editor.notice && !selection.problem) {
    return null;
  }
  return (
    <div className={classes.controls}>
      <p className={classes.help} role="status">
        {editor.notice ??
          (selection.isSelecting
            ? `Tap photos to tick them, or open a stack to choose its photos. Up to ${BULK_EDIT_MAX_ITEMS} at once.`
            : "")}
      </p>
      {selection.problem ? <p role="alert">{selection.problem}</p> : null}
    </div>
  );
}

function _getPileSelectionFromState(
  selection: Readonly<SelectionState>,
  isBusy: boolean,
): PileSelection | undefined {
  return selection.isSelecting
    ? {
        selectedItemIds: selection.selectedItemIds,
        framesByBurstId: selection.framesByBurstId,
        isBusy,
        onToggle: selection.onToggle,
        onOpenBurst: selection.onOpenBurst,
      }
    : undefined;
}

/** Wraps the existing pile in optional upload-style tick mode. */
export function TimelineBulkEditor(props: Readonly<Props>): ReactNode {
  const selection = useTimelineSelection(props.days, props.filterSelection);
  const editor = useEditorControls({ selection, onChanged: props.onChanged });
  const isBusy = selection.isLoading || editor.choice !== undefined;
  const context = _getPileSelectionFromState(selection, isBusy);
  return (
    <PileSelectionContext value={context}>
      {!selection.isSelecting ? (
        <TimelineSelectionHeaderButton
          buttonRef={editor.selectButton}
          onStart={editor.onStart}
        />
      ) : null}
      {_renderControls({ editor, selection })}
      {selection.isSelecting ? (
        <TimelineSelectionBar
          count={selection.selectedItemIds.size}
          isBusy={isBusy}
          onOpen={editor.onOpen}
          onTickLoaded={selection.tickLoaded}
          onClear={selection.clear}
          onFinish={editor.onFinish}
        />
      ) : null}
      {props.children}
      {editor.choice ? (
        <TimelineBulkDialog
          choice={editor.choice}
          onClose={editor.onClose}
          onSaved={editor.onSaved}
          onReview={editor.onReview}
        />
      ) : null}
    </PileSelectionContext>
  );
}
