import { useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ItemDetail,
  DirectoryPerson,
  PersonTaggingOption,
} from "@memory-shoebox/shared";
import { personTaggingQueryOptions } from "@/api/items/personTagging";
import { makePeopleQueryOptionsFromSearchScope } from "@/api/vocabularies/vocabularies";
import { useSetItemPeople } from "@/surfaces/Item/itemWrites/useSetItemPeople/useSetItemPeople";
import {
  PeopleField,
  type PeopleFieldPerson,
} from "@/system/PeopleField/PeopleField";
import {
  usePersonManagement,
  type PersonManagement,
} from "./usePersonManagement";
import { usePersonChoices } from "./usePersonChoices";

type PeopleEditorState = {
  inputProps: Pick<
    ComponentProps<typeof PeopleField>,
    | "people"
    | "value"
    | "onChange"
    | "selectedPersonIds"
    | "onSelectPerson"
    | "onRemovePerson"
    | "onRenamePerson"
    | "onDeletePerson"
    | "isManaging"
  >;
  management: PersonManagement;
  renaming: PeopleFieldPerson | undefined;
  closeRename: () => void;
  writeError: string | undefined;
};

function _getFieldPeopleFromDirectory(
  entries: ReadonlyArray<DirectoryPerson | PersonTaggingOption>,
): PeopleFieldPerson[] {
  return entries.map((entry) => {
    return {
      ...entry.person,
      itemCount: entry.itemCount,
      canRename: "canRename" in entry && entry.canRename,
      canDelete: "canDelete" in entry && entry.canDelete,
    };
  });
}

function _getChoicePropsFromField(field: ReturnType<typeof usePersonChoices>) {
  return {
    value: field.choices.map((choice) => {
      return choice.displayName;
    }),
    selectedPersonIds: field.choices.map((choice) => {
      return choice.personId;
    }),
    onChange: field.onChange,
    onSelectPerson: field.onSelectPerson,
    onRemovePerson: field.onRemovePerson,
  };
}

/** Shares optimistic choices, permissions and the modal's mutation state. */
export function usePeopleEditor(
  detail: Readonly<ItemDetail>,
): PeopleEditorState {
  const directory = useQuery(
    makePeopleQueryOptionsFromSearchScope({ q: undefined }),
  );
  const options = useQuery(personTaggingQueryOptions(detail.itemId));
  const [renaming, setRenaming] = useState<PeopleFieldPerson>();
  const write = useSetItemPeople(detail.itemId);
  const field = usePersonChoices({ detail, write });
  const management = usePersonManagement({
    itemId: detail.itemId,
    onSaved: (saved, personId) => {
      write.forgetPerson(personId);
      field.reset(saved);
      setRenaming(undefined);
    },
  });
  const people = _getFieldPeopleFromDirectory(
    options.data?.people ?? directory.data?.people ?? [],
  );
  return {
    management,
    renaming,
    writeError: write.error,
    closeRename: () => {
      setRenaming(undefined);
      management.reset();
    },
    inputProps: {
      people,
      ..._getChoicePropsFromField(field),
      isManaging: management.isSaving,
      onRenamePerson: write.isSaving
        ? undefined
        : (person) => {
            management.reset();
            setRenaming(person);
          },
      onDeletePerson: write.isSaving
        ? undefined
        : (person) => {
            management.save({ personId: person.personId });
          },
    },
  };
}
