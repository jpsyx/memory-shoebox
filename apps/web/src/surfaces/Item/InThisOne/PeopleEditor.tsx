import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  LIMITS,
  type ItemDetail,
  type PeopleResponse,
  type PersonRef,
} from "@memory-shoebox/shared";
import { peopleQueryOptions } from "@/api/vocabularies/vocabularies";
import { PeopleField } from "@/system/PeopleField/PeopleField";
import { EditorFooter } from "@/surfaces/Item/InThisOne/EditorFooter";
import { makePeopleInputsFromNames } from "@/surfaces/Item/InThisOne/makePeopleInputsFromNames/makePeopleInputsFromNames";
import { useSetItemPeople } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
  onDone: () => void;
};

/** The names on the item now, which is what the field starts from. */
function _namesOf(detail: ItemDetail): string[] {
  return detail.people.map((person) => {
    return person.displayName;
  });
}

/** Everybody a name could mean: the item's own people first, then the rest. */
function _knownPeople(options: {
  detail: ItemDetail;
  directoryPeople: PeopleResponse["people"];
}): PersonRef[] {
  return [
    ...options.detail.people,
    ...options.directoryPeople.map((entry) => {
      return entry.person;
    }),
  ];
}

/**
 * Tagging people, which saves as it changes.
 *
 * A failed save resets the field to the server's set rather than leaving a
 * pill the server never accepted.
 */
export function PeopleEditor({ detail, onDone }: Readonly<Props>): ReactNode {
  const directory = useQuery(peopleQueryOptions(undefined));
  const write = useSetItemPeople(detail.itemId);
  const [names, setNames] = useState(() => {
    return _namesOf(detail);
  });
  const directoryPeople = directory.data?.people ?? [];

  return (
    <Stack gap="sm">
      <PeopleField
        label="Who is in it"
        description="Start typing. Press Enter on a name the archive has never heard of to add it."
        placeholder="Mateo, Abuela Rosa"
        mode="anyone"
        members={[]}
        people={directoryPeople.map((entry) => {
          return { ...entry.person, itemCount: entry.itemCount };
        })}
        value={names}
        onChange={(nextNames) => {
          if (nextNames.length > LIMITS.itemMaxPeople) {
            return;
          }
          setNames([...nextNames]);
          write.save(
            makePeopleInputsFromNames({
              names: nextNames,
              known: _knownPeople({ detail, directoryPeople }),
            }),
            {
              onError: () => {
                setNames(_namesOf(detail));
              },
            },
          );
        }}
      />
      <EditorFooter error={write.error} onDone={onDone} />
    </Stack>
  );
}
