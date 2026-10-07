import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
/**
 * Arrangement belongs to the shared wall rather than each member's
 * preferences.
 */
export function ArrangementExplanation(): ReactNode {
  return <Banner>This arrangement applies to everyone in this Shoebox.</Banner>;
}
