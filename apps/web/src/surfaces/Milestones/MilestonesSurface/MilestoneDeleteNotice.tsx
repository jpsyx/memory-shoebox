import type { DeleteMilestoneResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
type Props = { deleted?: DeleteMilestoneResponse };
/** Returned deletion facts are announced and receive focus after navigation. */
export function MilestoneDeleteNotice({ deleted }: Readonly<Props>): ReactNode {
  return deleted ? (
    <div
      role="status"
      tabIndex={-1}
      ref={(element) => {
        return element?.focus();
      }}
    >
      <Prose onPanel>
        Deleted {deleted.name}. Detached {deleted.detachedItemCount}{" "}
        {deleted.detachedItemCount === 1 ? "item" : "items"}. The photographs
        stay.
      </Prose>
    </div>
  ) : null;
}
