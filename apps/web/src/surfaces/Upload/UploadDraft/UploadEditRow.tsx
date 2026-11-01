import { personLabel } from "@/system/personLabel/personLabel";
import { PersonIdentityLabel } from "@/system/personLabel/PersonIdentityLabel";
import classes from "@/system/system.module.css";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
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
  const person =
    edit.kind === "person"
      ? (edit.person ?? {
          personId: "",
          displayName: edit.label,
          isMember: false,
        })
      : undefined;
  const label = person ? personLabel(person) : edit.label;
  return (
    <div className={classes.editRow}>
      <span className={classes.editKind}>{edit.kind}</span>
      <span className={classes.chip}>
        {person ? <PersonIdentityLabel person={person} /> : label}
      </span>
      <span className={classes.editCount}>
        on {edit.targetCount} of {snapshot.detail!.files.length}
      </span>
      <Button
        variant="default"
        size="sm"
        disabled={!edit.canUndo || snapshot.isBusy || isPending}
        aria-label={`Undo ${label}`}
        onClick={() => {
          onUndo(edit.editId);
        }}
      >
        Undo
      </Button>
    </div>
  );
}
