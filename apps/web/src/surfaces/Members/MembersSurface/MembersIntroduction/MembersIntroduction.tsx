import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import classes from "./MembersIntroduction.module.css";

type Props = { memberCount: number };
/** Directory explanation and the link to group access. */
export function MembersIntroduction({
  memberCount,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Prose onPanel>
        {memberCount} {memberCount === 1 ? "person" : "people"}, by invitation
        only. An address that has not been invited cannot sign in.
      </Prose>
      <Link to="/groups" className={classes.membersIntroductionLink}>
        Groups
      </Link>
    </>
  );
}
