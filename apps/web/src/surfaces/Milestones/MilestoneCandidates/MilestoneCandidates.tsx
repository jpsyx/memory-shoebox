import type { ComponentProps, ReactNode } from "react";
import { MilestonePicker } from "./MilestonePicker/MilestonePicker";
type Props = Omit<ComponentProps<typeof MilestonePicker>, "source">;
/** Saved-occasion suggestions on its inclusive span, using individual IDs. */
export function MilestoneCandidates(options: Readonly<Props>): ReactNode {
  return <MilestonePicker {...options} source="span" />;
}
