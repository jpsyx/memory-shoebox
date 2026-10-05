import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import classes from "@/surfaces/Members/MembersSurface/MembersSurface.module.css";

type Props = { memberCount: number };
/** Directory explanation and the link to group access. */
export function MembersIntroduction({
  memberCount,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Prose onPanel>
        {memberCount} people, by invitation only. An address that has not been
        invited cannot sign in.
      </Prose>
      <Link to="/groups" className={classes.link}>
        Groups
      </Link>
    </>
  );
}
