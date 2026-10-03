import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { peopleQueryOptions } from "@/api/vocabularies/vocabularies";
import { PeopleField } from "@/system/PeopleField/PeopleField";
import { Prose } from "@/system/typography/Prose";
import { EditorFooter } from "@/surfaces/Item/InThisOne/EditorFooter";
import { useNameField } from "@/surfaces/Item/InThisOne/useNameField";
import { peopleCapProse } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { useSetItemPeople } from "@/surfaces/Item/itemWrites/useSetItemPeople/useSetItemPeople";

type Props = {
  detail: ItemDetail;
  onDone: () => void;
};

/**
 * Tagging people, which saves as it changes.
 *
 * The names become people only as each save goes out (`useSetItemPeople`),
 * and a failed save puts the field back to the server's set rather than
 * leaving a pill the server never accepted.
 */
export function PeopleEditor({ detail, onDone }: Readonly<Props>): ReactNode {
  const directory = useQuery(peopleQueryOptions(undefined));
  const write = useSetItemPeople(detail.itemId);
  const directoryPeople = directory.data?.people ?? [];
  const field = useNameField({
    detail,
    namesOf: (itemDetail) => {
      return itemDetail.people.map((person) => {
        return person.displayName;
      });
    },
    max: LIMITS.itemMaxPeople,
    save: write.save,
  });

  return (
    <Stack gap="sm">
      <PeopleField
        label="Who is in it"
        description="Start typing. Press Enter on a name the archive has never heard of to add it."
        placeholder="Mateo, Abuela Rosa"
        mode="anyone"
        autoFocus
        members={[]}
        people={directoryPeople.map((entry) => {
          return { ...entry.person, itemCount: entry.itemCount };
        })}
        value={field.names}
        onChange={field.onChange}
      />
      {field.isFull ? <Prose>{peopleCapProse(detail.kind)}</Prose> : null}
      <EditorFooter error={write.error} onDone={onDone} />
    </Stack>
  );
}
