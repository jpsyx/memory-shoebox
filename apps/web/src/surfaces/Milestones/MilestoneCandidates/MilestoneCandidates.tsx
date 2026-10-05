import type { ComponentProps, ReactNode } from "react";
import { MilestonePicker } from "./MilestonePicker/MilestonePicker";
type Props = Omit<ComponentProps<typeof MilestonePicker>, "source">;
/** Saved-occasion suggestions on its inclusive span, using individual IDs. */
export function MilestoneCandidates({
  detail,
  viewer,
  hasUsableAuthority,
  onDone,
  onFix,
}: Readonly<Props>): ReactNode {
  const options = { detail, viewer, hasUsableAuthority, onDone, onFix };
  return <MilestonePicker {...options} source="span" />;
}
