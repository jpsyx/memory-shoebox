import { makeMilestoneDetailQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { useQuery } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { MilestoneStep } from "../MilestoneStep/MilestoneStep";
import { MilestoneSelectionContents } from "./MilestoneSelectionContents/MilestoneSelectionContents";
/** Selected occasion identity and its workflow inputs. */
export type Props = Omit<ComponentProps<typeof MilestoneStep>, "detail"> & {
  milestoneId: string;
};
/** Fetches authoritative selected detail before mounting any existing write. */
export function MilestoneSelection({
  viewer,
  hasUsableAuthority,
  memberId,
  onDeleted,
  onSaved,
  mode,
  onNavigate,
  milestoneId,
}: Readonly<Props>): ReactNode {
  const options = {
    viewer,
    hasUsableAuthority,
    memberId,
    onDeleted,
    onSaved,
    mode,
    onNavigate,
    milestoneId,
  };
  const query = useQuery(
    makeMilestoneDetailQueryOptionsFromIdentity({
      memberId: options.memberId,
      milestoneId: options.milestoneId,
    }),
  );
  return <MilestoneSelectionContents options={options} query={query} />;
}
