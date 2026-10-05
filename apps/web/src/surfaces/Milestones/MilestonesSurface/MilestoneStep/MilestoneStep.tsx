import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type {
  DeleteMilestoneResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { MilestoneSearch } from "../../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
import { MilestoneStepDecision } from "./MilestoneStepDecision/MilestoneStepDecision";
/** Stored occasion authority and workflow completion callbacks. */
export type Props = {
  viewer: Viewer;
  detail: MilestoneDetail;
  mode: MilestoneSearch["mode"];
  hasUsableAuthority?: boolean;
  memberId: string;
  onNavigate: (search: MilestoneSearch) => void;
  onSaved: (detail: MilestoneDetail) => void;
  onDeleted: (result: DeleteMilestoneResponse) => void;
};
/** Presents the occasion workflow step selected by the stored address. */
export function MilestoneStep({
  viewer,
  detail,
  mode,
  hasUsableAuthority,
  memberId,
  onNavigate,
  onSaved,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const options = {
    viewer,
    detail,
    mode,
    hasUsableAuthority,
    memberId,
    onNavigate,
    onSaved,
    onDeleted,
  };

  const onCancel = () => {
    return onNavigate({});
  };
  return <MilestoneStepDecision options={options} onCancel={onCancel} />;
}
