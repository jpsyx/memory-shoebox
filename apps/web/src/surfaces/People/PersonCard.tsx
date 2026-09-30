import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { DirectoryPerson } from "@memory-shoebox/shared";
import classes from "@/system/system.module.css";

type Props = {
  entry: DirectoryPerson;
};

/**
 * One person in the directory.
 *
 * **A member and a non-member are drawn identically**, on purpose. A
 * grandmother worth tracking in the archive need not hold an account, and
 * marking who has a login turns a directory of the family into a list of
 * users. `DirectoryPerson` carries no `memberId` precisely so this card
 * cannot say.
 *
 * It is a link rather than a button because it goes somewhere: pressing a
 * name filters the pile to the photographs they are in. There is no page for
 * a person; a person is a way into the archive, not a profile in it.
 */
export function PersonCard({ entry }: Readonly<Props>): ReactNode {
  return (
    <Link
      to="/"
      search={{ person: [entry.person.personId] }}
      className={classes.personCard}
    >
      {entry.face === null ? (
        <span className={`${classes.personFace} ${classes.personFaceEmpty}`} />
      ) : (
        <span className={classes.personFace}>
          <img src={entry.face.url} alt="" loading="lazy" />
        </span>
      )}
      <span className={classes.personName}>{entry.person.displayName}</span>
      <span className={classes.personCount}>
        {entry.itemCount === 0
          ? "Nothing yet"
          : `${entry.itemCount.toLocaleString("en-GB")} photos and videos`}
      </span>
    </Link>
  );
}
