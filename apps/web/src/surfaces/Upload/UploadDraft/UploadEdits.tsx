import { Button, Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { UploadBatchEditDto } from "@memory-shoebox/shared";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import classes from "@/system/system.module.css";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };
function _editRow(
  edit: Readonly<UploadBatchEditDto>,
  snapshot: Readonly<UploadSnapshot>,
  onUndo: (editId: string) => void,
  isPending: boolean,
): ReactNode {
  return (
    <div key={edit.editId} className={classes.editRow}>
      <span className={classes.editKind}>{edit.kind}</span>
      <span className={classes.chip}>{edit.label}</span>
      <span className={classes.editCount}>
        on {edit.targetCount} of {snapshot.detail!.files.length}
      </span>
      <Button
        variant="default"
        size="sm"
        disabled={!edit.canUndo || snapshot.isBusy || isPending}
        aria-label={`Undo ${edit.label}`}
        onClick={() => {
          onUndo(edit.editId);
        }}
      >
        Undo
      </Button>
    </div>
  );
}
type SavedPlanOptions = {
  snapshot: UploadSnapshot;
  onUndo: (editId: string) => void;
  isPending: boolean;
  error?: string;
};
function _savedPlan(options: Readonly<SavedPlanOptions>): ReactNode {
  const edits =
    options.snapshot.detail?.edits.filter((edit) => {
      return edit.undoneAt === null;
    }) ?? [];
  return edits.length === 0 ? null : (
    <Sheet wide label="What you have added">
      <Stack gap="sm">
        <LabelText component="h2">What you have added</LabelText>
        <Prose>
          Everything a bulk action has put on this batch, and what it landed on.
          Labels can be taken off while this batch is a draft.
        </Prose>
        <div>
          {edits.map((edit) => {
            return _editRow(
              edit,
              options.snapshot,
              options.onUndo,
              options.isPending,
            );
          })}
        </div>
        {options.error ? (
          <div role="alert">
            <Prose>{options.error}</Prose>
          </div>
        ) : null}
      </Stack>
    </Sheet>
  );
}
/** Server-owned saved plan; unknown print targets never hide an edit row. */
export function UploadEdits({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const onUndo = (editId: string) => {
    if (isPending) {
      return;
    }
    setIsPending(true);
    setError(undefined);
    void controller
      .undoEdit(editId)
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        setIsPending(false);
      });
  };
  return _savedPlan({ snapshot, onUndo, isPending, error });
}
