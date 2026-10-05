import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
/**
 * Arrangement belongs to the shared wall rather than each member's
 * preferences.
 */
export function ArrangementExplanation(): ReactNode {
  return (
    <Banner>
      <b>One wall for everybody.</b> This is not a comfort setting each member
      adjusts for themselves. The arrangement is part of what the place looks
      like, so it is chosen once, here.
    </Banner>
  );
}
