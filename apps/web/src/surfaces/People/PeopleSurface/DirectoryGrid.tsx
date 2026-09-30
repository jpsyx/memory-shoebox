import type { ReactNode } from "react";
import type { DirectoryPerson } from "@memory-shoebox/shared";
import { PersonCard } from "@/surfaces/People/PersonCard";
import { LabelText } from "@/system/typography/LabelText";
import classes from "@/system/system.module.css";

type Props = {
  people: readonly DirectoryPerson[];
  /** `peopleCount`, the directory before `q` narrows it. */
  total: number;
  isNarrowed: boolean;
};

/**
 * The heading that says how much of the directory is showing, then the grid.
 *
 * `total` is `peopleCount`, never `people.length`: it is not per viewer, so
 * "6 of 10 people" cannot be misread as somebody having been removed.
 */
export function DirectoryGrid({
  people,
  total,
  isNarrowed,
}: Readonly<Props>): ReactNode {
  return (
    <div>
      <LabelText component="h2">
        {isNarrowed ? `${people.length} of ${total} people` : `${total} people`}
      </LabelText>
      <div className={classes.peopleGrid}>
        {people.map((entry) => {
          return <PersonCard key={entry.person.personId} entry={entry} />;
        })}
      </div>
    </div>
  );
}
