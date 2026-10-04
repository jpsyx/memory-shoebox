import { Button, Stack } from "@mantine/core";
import type {
  DeleteMilestoneResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { MilestoneForm } from "../MilestoneForm/MilestoneForm";
import { MilestoneDeleteDialog } from "../MilestoneDeleteDialog/MilestoneDeleteDialog";
import { MilestoneEmpty } from "../MilestoneEmpty";
import type { MilestoneSearch } from "../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
type Props = {
  detail: MilestoneDetail;
  mode: MilestoneSearch["mode"];
  hasUsableAuthority?: boolean;
  memberId: string;
  onNavigate: (search: MilestoneSearch) => void;
  onSaved: (detail: MilestoneDetail) => void;
  onDeleted: (result: DeleteMilestoneResponse) => void;
};
function _MilestoneSavedStep({
  detail,
  mode,
  onCancel,
}: Readonly<{
  detail: MilestoneDetail;
  mode: MilestoneSearch["mode"];
  onCancel: () => void;
}>): ReactNode {
  return (
    <Sheet
      wide
      label={
        mode === "fix"
          ? "Photographs outside the span"
          : "Photographs for this occasion"
      }
    >
      <SheetHead title={detail.milestone.name} />
      <Stack gap="md">
        <Prose>
          {mode === "created"
            ? "The occasion is saved. Leaving this step keeps it on its dates."
            : mode === "fix"
              ? `${detail.mismatchCount} attached photographs need a decision about their dates.`
              : "Attaching photographs keeps them on the days they were taken."}
        </Prose>
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Sheet>
  );
}
function _MilestoneReadOnly({
  onCancel,
}: Readonly<{ onCancel: () => void }>): ReactNode {
  return (
    <Sheet>
      <Prose>This occasion is read-only.</Prose>
      <Button variant="default" onClick={onCancel}>
        Back to the list
      </Button>
    </Sheet>
  );
}
function _isMilestoneReadOnly({
  detail,
  mode,
}: Readonly<{
  detail: MilestoneDetail;
  mode: MilestoneSearch["mode"];
}>): boolean {
  return (
    ((mode === "edit" ||
      mode === "created" ||
      mode === "attach" ||
      mode === "fix") &&
      !detail.canEdit) ||
    (mode === "delete" && !detail.canDelete)
  );
}
function _MilestoneEmptyStep({
  detail,
  onNavigate,
  onCancel,
}: Readonly<{
  detail: MilestoneDetail;
  onNavigate: Props["onNavigate"];
  onCancel: () => void;
}>): ReactNode {
  return (
    <MilestoneEmpty
      detail={detail}
      onAttach={() => {
        return onNavigate({
          milestone: detail.milestone.milestoneId,
          mode: "attach",
        });
      }}
      onCancel={onCancel}
    />
  );
}
function _MilestoneEditStep({
  options,
  onCancel,
}: Readonly<{ options: Readonly<Props>; onCancel: () => void }>): ReactNode {
  return (
    <MilestoneForm
      detail={options.detail}
      hasUsableAuthority={options.hasUsableAuthority}
      onSaved={options.onSaved}
      onCancel={onCancel}
    />
  );
}
/** Stored-mode extension seam for candidate attachment and reconciliation. */
export function MilestoneStep(options: Readonly<Props>): ReactNode {
  const { detail, mode, memberId, onNavigate, onDeleted } = options;
  const onCancel = () => {
    return onNavigate({});
  };
  if (mode === "edit") {
    return <_MilestoneEditStep options={options} onCancel={onCancel} />;
  }
  if (_isMilestoneReadOnly({ detail, mode })) {
    return <_MilestoneReadOnly onCancel={onCancel} />;
  }
  if (mode === "delete") {
    return (
      <MilestoneDeleteDialog
        detail={detail}
        memberId={memberId}
        onDeleted={onDeleted}
        onCancel={onCancel}
      />
    );
  }
  if (mode === "empty") {
    return (
      <_MilestoneEmptyStep
        detail={detail}
        onNavigate={onNavigate}
        onCancel={onCancel}
      />
    );
  }
  return (
    <_MilestoneSavedStep detail={detail} mode={mode} onCancel={onCancel} />
  );
}
