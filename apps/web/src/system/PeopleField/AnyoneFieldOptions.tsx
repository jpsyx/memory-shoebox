import { PersonIdentityLabel } from "@/system/personLabel/PersonIdentityLabel";
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
  selectedPeople?: ReadonlyArray<import("./PeopleField").PersonChoice>;
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
  const knownNames = options.people
    .filter((person) => {
      return !person.isMember;
    })
    .map((person) => {
      return person.displayName;
    });
  return [...knownNames, ...options.value].some((name) => {
    return makeNameKeyFromName(name) === makeNameKeyFromName(options.typed);
  });
}

function _getChosenNamesFromProps(props: Readonly<Props>): readonly string[] {
  return props.value.filter((_, index) => {
    return !(
      props.selectedPeople?.[index]?.isMember ??
      props.people.find((person) => {
        return person.personId === props.selectedPersonIds?.[index];
      })?.isMember
    );
  });
}

function _isChosenPerson({
  props,
  person,
}: Readonly<{ props: Props; person: PeopleFieldPerson }>): boolean {
  return props.selectedPersonIds === undefined
    ? props.value.some((name) => {
        return (
          makeNameKeyFromName(name) === makeNameKeyFromName(person.displayName)
        );
      })
    : props.selectedPersonIds.includes(person.personId);
}

/** Known names stay manageable after selection; actions never select a name. */
export function AnyoneFieldOptions(props: Readonly<Props>): ReactNode {
  const { people, search, selectedPersonIds } = props;
  const actions = {
    onRenamePerson: props.onRenamePerson,
    onDeletePerson: props.onDeletePerson,
    isManaging: props.isManaging,
    onAction: props.onAction,
  };
  const typed = search.trim();
  const isTaken = _isKnownName({
    people,
    value: _getChosenNamesFromProps(props),
    typed,
  });
  return (
    <Combobox.Options>
      {_getPeopleFromSearch(props).map((person) => {
        const isChosen = _isChosenPerson({ props, person });
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
        <Combobox.Option
          value={typed}
          aria-label={`Add “${typed}” (not a member)`}
        >
          Add{" "}
          <PersonIdentityLabel
            person={{ displayName: `“${typed}”`, isMember: false }}
          />
          <span className={classes.comboOptionCount}>new</span>
        </Combobox.Option>
      ) : null}
    </Combobox.Options>
  );
}
