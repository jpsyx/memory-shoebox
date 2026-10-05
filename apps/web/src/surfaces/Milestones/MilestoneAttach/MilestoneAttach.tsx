import type { ComponentProps, ReactNode } from "react";
import { MilestonePicker } from "../MilestoneCandidates/MilestonePicker/MilestonePicker";
type Props = Omit<ComponentProps<typeof MilestonePicker>, "source">;
/** Existing-occasion attachment picker using the archive's filter grammar. */
export function MilestoneAttach({
  detail,
  viewer,
  hasUsableAuthority,
  onDone,
  onFix,
}: Readonly<Props>): ReactNode {
  const options = { detail, viewer, hasUsableAuthority, onDone, onFix };
  return <MilestonePicker {...options} source="archive" />;
}
