import type { ReactNode } from "react";
import {
  useMilestoneForm,
  type MilestoneFormOptions,
} from "../useMilestoneForm/useMilestoneForm";
import { MilestoneFormLayout } from "./MilestoneFormLayout/MilestoneFormLayout";
type Props = MilestoneFormOptions;
/** Create or edit an occasion, without changing photograph capture dates. */
export function MilestoneForm({
  detail,
  memberId,
  selection,
  hasUsableAuthority,
  onSaved,
  onCancel,
}: Readonly<Props>): ReactNode {
  const options = {
    detail,
    memberId,
    selection,
    hasUsableAuthority,
    onSaved,
    onCancel,
  };
  const form = useMilestoneForm(options);
  const isBlocked =
    form.isSaving ||
    form.isUncertain ||
    form.hasSaved ||
    options.hasUsableAuthority === false;
  return (
    <MilestoneFormLayout options={options} form={form} isBlocked={isBlocked} />
  );
}
