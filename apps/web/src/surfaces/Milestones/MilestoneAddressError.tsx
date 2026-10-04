import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
/** Safe address refusal mounts no occasion mutation or selected detail. */
export function MilestoneAddressError(): ReactNode {
  return (
    <Page>
      <Lede>This occasion address is not valid.</Lede>
      <Link to="/milestones" search={{}}>
        Back to milestones
      </Link>
    </Page>
  );
}
