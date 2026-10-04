import classes from "@/system/system.module.css";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
import { Button } from "@mantine/core";
import type { UploadBatchEditDto } from "@memory-shoebox/shared";
import { type ReactNode } from "react";
type Props = {
  edit: Readonly<UploadBatchEditDto>;
  snapshot: Readonly<UploadSnapshot>;
  onUndo: (editId: string) => void;
  isPending: boolean;
};

/** Shows one saved draft edit and its available Undo action. */
export function UploadEditRow({
  edit,
  snapshot,
  onUndo,
  isPending,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.editRow}>
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
