import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Chip } from "@/system/Chip/Chip";
import { ChipLink } from "@/system/Chip/ChipLink";
import { ChipRow } from "@/system/Chip/ChipRow";
import { PeopleEditor } from "@/surfaces/Item/InThisOne/PeopleEditor";
import { useEditorToggle } from "@/surfaces/Item/useEditorToggle";

type Props = {
  detail: ItemDetail;
};

/**
 * Who is in it: each person a link into the pile filtered by them, and for an
 * uploader a way to tag somebody, members and non-members alike.
 */
export function PeopleRow({ detail }: Readonly<Props>): ReactNode {
  const editor = useEditorToggle();
  return editor.isEditing ? (
    <PeopleEditor detail={detail} onDone={editor.close} />
  ) : (
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
        <Chip ref={editor.openerRef} onClick={editor.open}>
          + Tag somebody
        </Chip>
      ) : null}
    </ChipRow>
  );
}
