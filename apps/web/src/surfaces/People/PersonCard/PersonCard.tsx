import { useVisibleThumbnail } from "@/media/useVisibleThumbnail/useVisibleThumbnail";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import classes from "./PersonCard.module.css";
import type { DirectoryPerson } from "@memory-shoebox/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { clsx } from "clsx";

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
  const thumbnail = useVisibleThumbnail({
    itemId: entry.person.personId,
    source: entry.face ?? undefined,
  });
  return (
    <Link
      ref={thumbnail.ref}
      to="/"
      search={{ person: [entry.person.personId] }}
      className={classes.personCard}
    >
      {entry.face === null ? (
        <span
          className={clsx(classes.personCardFace, classes.personCardFaceEmpty)}
        >
          <MediaPlaceholder
            altText={entry.person.displayName}
            width={1}
            height={1}
            state="unavailable"
          />
        </span>
      ) : (
        <span className={classes.personCardFace}>
          <img src={thumbnail.source?.url} alt="" loading={thumbnail.loading} />
        </span>
      )}
      <span className={classes.personCardName}>{entry.person.displayName}</span>
      <span className={classes.personCardCount}>
        {entry.itemCount === 0
          ? "Nothing yet"
          : `${entry.itemCount.toLocaleString("en-GB")} photos and videos`}
      </span>
    </Link>
  );
}
