import { ActionIcon, Group } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { PeopleFieldPerson } from "./PeopleField";

type Props = {
  person: PeopleFieldPerson;
  onRenamePerson?: (person: PeopleFieldPerson) => void;
  onDeletePerson?: (person: PeopleFieldPerson) => void;
  isManaging: boolean;
  onAction: () => void;
};

/** Separate buttons prevent editing and deletion from also tagging a name. */
export function PersonOptionActions({
  person,
  onRenamePerson,
  onDeletePerson,
  isManaging,
  onAction,
}: Readonly<Props>): ReactNode {
  return (
    <Group
      gap={0}
      wrap="nowrap"
      onMouseDown={(event) => {
        event.preventDefault();
      }}
    >
      {person.canRename && onRenamePerson ? (
        <ActionIcon
          variant="subtle"
          size={44}
          aria-label={`Rename ${person.displayName}`}
          disabled={isManaging}
          onClick={(event) => {
            event.stopPropagation();
            onAction();
            onRenamePerson(person);
          }}
        >
          <IconPencil size={20} />
        </ActionIcon>
      ) : null}
      {person.canDelete && onDeletePerson ? (
        <ActionIcon
          variant="subtle"
          size={44}
          aria-label={`Delete ${person.displayName}`}
          disabled={isManaging}
          onClick={(event) => {
            event.stopPropagation();
            onAction();
            onDeletePerson(person);
          }}
        >
          <IconTrash size={20} />
        </ActionIcon>
      ) : null}
    </Group>
  );
}
