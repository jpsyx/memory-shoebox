import { personLabel } from "./personLabel";
import type { ReactNode } from "react";
import type { PersonRef } from "@memory-shoebox/shared";
import classes from "./PersonLabel.module.css";

/** Visible membership copy keeps its regular weight beside the raw name. */
export function PersonIdentityLabel({
  person,
}: Readonly<{
  person: Pick<PersonRef, "displayName" | "isMember">;
}>): ReactNode {
  return (
    <span aria-label={personLabel({ ...person, personId: "" })}>
      {person.displayName}
      {person.isMember ? null : (
        <span className={classes.suffix}> (not a member)</span>
      )}
    </span>
  );
}
