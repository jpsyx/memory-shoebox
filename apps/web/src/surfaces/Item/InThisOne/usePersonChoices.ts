import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LIMITS,
  type ItemDetail,
  type PersonRef,
} from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";
import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";
import type { PersonChoice } from "@/system/PeopleField/PeopleField";
import type { ItemWrite } from "@/surfaces/Item/itemWrites/useItemDetailWrite/useItemDetailWrite";

type PersonChoices = {
  choices: PersonChoice[];
  reset: (detail: ItemDetail) => void;
  onChange: (names: readonly string[]) => void;
  onSelectPerson: (person: PersonRef) => void;
  onRemovePerson: (index: number) => void;
};

function _hasChosenPerson(
  options: Readonly<{ choices: readonly PersonChoice[]; person: PersonRef }>,
): boolean {
  return options.choices.some((choice) => {
    return (
      choice.personId === options.person.personId ||
      (!choice.personId &&
        makeNameKeyFromName(choice.displayName) ===
          makeNameKeyFromName(options.person.displayName))
    );
  });
}

function _getAddedChoicesFromNames(
  options: Readonly<{
    names: readonly string[];
    choices: readonly PersonChoice[];
  }>,
): PersonChoice[] {
  return [
    ...options.choices,
    ...options.names.slice(options.choices.length).map((displayName) => {
      return { displayName };
    }),
  ];
}

/** Optimistic choices retain IDs even when two people share a name. */
export function usePersonChoices(
  options: Readonly<{
    detail: ItemDetail;
    write: ItemWrite<readonly PersonChoice[]>;
  }>,
): PersonChoices {
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<PersonChoice[]>(options.detail.people);
  const reset = (detail: ItemDetail) => {
    setChoices(detail.people);
  };
  const restore = () => {
    reset(
      queryClient.getQueryData(
        itemQueryOptions(options.detail.itemId).queryKey,
      ) ?? options.detail,
    );
  };
  const save = (updatedChoices: PersonChoice[]) => {
    if (updatedChoices.length > LIMITS.itemMaxPeople) {
      return;
    }
    setChoices(updatedChoices);
    options.write.save({
      variables: updatedChoices,
      onSuccess: restore,
      onError: restore,
    });
  };
  return {
    choices,
    reset,
    onChange: (names) => {
      save(_getAddedChoicesFromNames({ names, choices }));
    },
    onSelectPerson: (person) => {
      if (!_hasChosenPerson({ choices, person })) {
        save([...choices, person]);
      }
    },
    onRemovePerson: (index) => {
      save(
        choices.filter((_, choiceIndex) => {
          return choiceIndex !== index;
        }),
      );
    },
  };
}
