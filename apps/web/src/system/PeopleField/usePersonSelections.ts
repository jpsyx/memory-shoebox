import { useState } from "react";

type PersonSelection = Readonly<{
  name: string;
  personId: string;
  index?: number;
}>;

function _getRetainedIdsFromIndices(
  personIds: Readonly<Record<string, string>>,
  indices: readonly number[],
): Record<string, string> {
  return Object.fromEntries(
    indices.flatMap((oldIndex, newIndex) => {
      return personIds[String(oldIndex)]
        ? [[String(newIndex), personIds[String(oldIndex)]!]]
        : [];
    }),
  );
}

/** Mutable form handlers for raw names and explicit person IDs. */
export type PersonSelections = {
  names: string[];
  personIds: Record<string, string>;
  retain: (remaining: string[], indices?: number[]) => void;
  onNamesChange: (values: readonly string[]) => void;
  onRemovePerson: (index: number) => void;
  onPersonChoice: (selection: PersonSelection) => void;
};

/**
 * Position-based selections preserve distinct identities with the same raw
 * name.
 */
export function usePersonSelections(): PersonSelections {
  const [names, setNames] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<Record<string, string>>({});
  const retain = (remaining: string[], indices: number[] = []) => {
    setNames(remaining);
    setPersonIds(_getRetainedIdsFromIndices(personIds, indices));
  };
  return {
    names,
    personIds,
    retain,
    onNamesChange: (values: readonly string[]) => {
      return setNames([...values]);
    },
    onRemovePerson: (index: number) => {
      const indices = names.flatMap((_, position) => {
        return position === index ? [] : [position];
      });
      retain(
        indices.map((position) => {
          return names[position]!;
        }),
        indices,
      );
    },
    onPersonChoice: ({ name, personId, index }: PersonSelection) => {
      setPersonIds((choices) => {
        return {
          ...choices,
          [String(index ?? names.indexOf(name))]: personId,
        };
      });
    },
  };
}
