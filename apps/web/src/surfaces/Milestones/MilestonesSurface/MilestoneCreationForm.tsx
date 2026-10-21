import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Prose } from "@/system/typography/Prose";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MilestoneForm } from "../MilestoneForm/MilestoneForm";

type Props = {
  viewer: Viewer;
  onSaved: (detail: MilestoneDetail) => void;
  onCancel: () => void;
};

/** Reads only this member's carried selection when opening a fresh create form. */
export function MilestoneCreationForm({
  viewer,
  onSaved,
  onCancel,
}: Readonly<Props>): ReactNode {
  const location = useLocation();
  const creation = location.state.milestoneCreation;
  if (viewer.role === "viewer") {
    return (
      <Prose onPanel>Only uploaders and admins can create milestones.</Prose>
    );
  }
  return (
    <MilestoneForm
      key={`${viewer.memberId}:create:${location.state.__TSR_key}`}
      selection={
        creation?.memberId === viewer.memberId ? creation.selection : undefined
      }
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}
