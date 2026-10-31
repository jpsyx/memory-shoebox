import type { PersonChoice, PeopleFieldPerson } from "./PeopleField";
import { PersonPill } from "./PersonPill";
import type { ReactNode } from "react";

type Props = {
  value: readonly string[];
  disabled: boolean;
  selectedPersonIds?: ReadonlyArray<string | undefined>;
  selectedPeople?: readonly PersonChoice[];
  people?: readonly PeopleFieldPerson[];
  onRemovePerson?: (index: number) => void;
  onChange: (names: readonly string[]) => void;
};

/** Removing a pill only untags the person, never deletes their identity. */
export function PersonPills({
  value,
  selectedPersonIds,
  selectedPeople,
  people,
  disabled,
  onChange,
  onRemovePerson,
}: Readonly<Props>): ReactNode {
  return value.map((name, index) => {
    const person = selectedPeople?.[index] ??
      people?.find((candidate) => {
        return candidate.personId === selectedPersonIds?.[index];
      }) ?? { displayName: name, isMember: false };
    return (
      <PersonPill
        key={`${name}-${index}`}
        person={person}
        disabled={disabled}
        onRemove={() => {
          if (onRemovePerson) {
            onRemovePerson(index);
            return;
          }
          onChange(
            value.filter((_, candidateIndex) => {
              return candidateIndex !== index;
            }),
          );
        }}
      />
    );
  });
}
