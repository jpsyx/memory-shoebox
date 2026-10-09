import { Combobox } from "@mantine/core";
import type { ComponentProps, ReactNode } from "react";
import { makeNameKeyFromName } from "./makeNameKeyFromName/makeNameKeyFromName";
import type { PeopleFieldPerson } from "./PeopleField";
import { PersonNameOption } from "./PersonNameOption";
import { PersonOptionActions } from "./PersonOptionActions";
import classes from "@/theme/components.module.css";

type Props = Omit<ComponentProps<typeof PersonOptionActions>, "person"> & {
  people: readonly PeopleFieldPerson[];
  value: readonly string[];
  search: string;
  selectedPersonIds?: ReadonlyArray<string | undefined>;
};

/** Upload names stay unique; saved-item options preserve each person's ID. */
function _getPeopleFromSearch(options: Readonly<Props>): PeopleFieldPerson[] {
  const names = new Set<string>();
  return options.people.filter((person) => {
    if (
      !makeNameKeyFromName(person.displayName).includes(
        makeNameKeyFromName(options.search),
      )
    ) {
      return false;
    }
    if (
      options.selectedPersonIds === undefined &&
      names.has(person.displayName)
    ) {
      return false;
    }
    names.add(person.displayName);
    return true;
  });
}

function _isKnownName(
  options: Readonly<{
    people: readonly PeopleFieldPerson[];
    value: readonly string[];
    typed: string;
  }>,
): boolean {
  const knownNames = options.people.map((person) => {
    return person.displayName;
  });
  return [...knownNames, ...options.value].some((name) => {
    return makeNameKeyFromName(name) === makeNameKeyFromName(options.typed);
  });
}

/** Known names stay manageable after selection; actions never select a name. */
export function AnyoneFieldOptions(props: Readonly<Props>): ReactNode {
  const { people, value, search, selectedPersonIds, ...actions } = props;
  const typed = search.trim();
  const isTaken = _isKnownName({ people, value, typed });
  return (
    <Combobox.Options>
      {_getPeopleFromSearch(props).map((person) => {
        const isChosen =
          selectedPersonIds === undefined
            ? value.some((name) => {
                return (
                  makeNameKeyFromName(name) ===
                  makeNameKeyFromName(person.displayName)
                );
              })
            : selectedPersonIds.includes(person.personId);
        return (
          <PersonNameOption
            key={person.personId}
            person={person}
            isChosen={isChosen}
            optionValue={
              selectedPersonIds === undefined
                ? person.displayName
                : `person:${person.personId}`
            }
            {...actions}
          />
        );
      })}
      {typed && !isTaken ? (
        <Combobox.Option value={typed}>
          {typed}
          <span className={classes.comboOptionCount}>new</span>
        </Combobox.Option>
      ) : null}
    </Combobox.Options>
  );
}
