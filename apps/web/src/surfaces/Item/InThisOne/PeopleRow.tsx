import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Chip } from "@/system/Chip/Chip";
import { ChipLink } from "@/system/Chip/ChipLink";
import { ChipRow } from "@/system/Chip/ChipRow";
import { PeopleEditor } from "@/surfaces/Item/InThisOne/PeopleEditor";

type Props = {
  detail: ItemDetail;
};

/**
 * Who is in it: each person a link into the pile filtered by them, and for an
 * uploader a way to tag somebody, members and non-members alike.
 */
export function PeopleRow({ detail }: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  if (isEditing) {
    return (
      <PeopleEditor
        detail={detail}
        onDone={() => {
          return setIsEditing(false);
        }}
      />
    );
  }
  return (
    <ChipRow>
      {detail.people.map((person) => {
        return (
          <ChipLink
            key={person.personId}
            to="/"
            search={{ person: person.personId }}
          >
            {person.displayName}
          </ChipLink>
        );
      })}
      {detail.capabilities.canEditPeople ? (
        <Chip
          onClick={() => {
            return setIsEditing(true);
          }}
        >
          + Tag somebody
        </Chip>
      ) : null}
    </ChipRow>
  );
}
