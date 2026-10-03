import { TagsInput } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { makeNameKeyFromName } from "@/system/PeopleField/nameKey/nameKey";
import type { PeopleFieldPerson } from "@/system/PeopleField/PeopleField";
import classes from "@/theme/components.module.css";

type Props = {
  label: string;
  description?: string;
  placeholder?: string;
  /** The names chosen. */
  value: readonly string[];
  onChange: (nextValue: readonly string[]) => void;
  people: readonly PeopleFieldPerson[];
  defaultSearchValue?: string;
  defaultDropdownOpened?: boolean;
  autoFocus?: boolean;
};

/** How many photographs a name is already on, or what it is instead. */
function _personDetail(
  options: Readonly<{
    name: string;
    people: readonly PeopleFieldPerson[];
  }>,
): string {
  const { name, people } = options;
  const person = people.find((candidate) => {
    return candidate.displayName === name;
  });
  return person === undefined
    ? "new"
    : person.itemCount === 0
      ? "none yet"
      : person.itemCount.toLocaleString("en-GB");
}

/**
 * The names to offer: every known name once, then the typed text itself when
 * nothing known or already chosen carries it.
 *
 * Two people can share a name, and the combobox refuses a repeated option, so
 * each name is offered once. The typed text is offered back so a name being
 * invented can be confirmed, by pointer or arrow keys as well as Enter. It is
 * in the list itself rather than added by a filter, because the combobox can
 * only submit an option it was given.
 */
function _optionNamesFrom(
  options: Readonly<{
    people: readonly PeopleFieldPerson[];
    value: readonly string[];
    search: string;
  }>,
): string[] {
  const knownNames = [
    ...new Set(
      options.people.map((person) => {
        return person.displayName;
      }),
    ),
  ];
  const typed = options.search.trim();
  const isTaken = [...knownNames, ...options.value].some((name) => {
    return makeNameKeyFromName(name) === makeNameKeyFromName(typed);
  });
  return typed === "" || isTaken ? knownNames : [...knownNames, typed];
}

/**
 * `PeopleField` in `anyone` mode: everybody the archive knows, and any name
 * it has never heard of. Each option carries how many photographs the name is
 * already on, and "new" for one it would be making.
 */
export function AnyoneField({
  value,
  people,
  defaultSearchValue = "",
  ...inputProps
}: Readonly<Props>): ReactNode {
  const [searchValue, setSearchValue] = useState(defaultSearchValue);
  return (
    <TagsInput
      {...inputProps}
      data={_optionNamesFrom({ people, value, search: searchValue })}
      renderOption={({ option }) => {
        return (
          <>
            {option.value}
            <span className={classes.comboOptionCount}>
              {_personDetail({ name: option.value, people })}
            </span>
          </>
        );
      }}
      value={[...value]}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      splitChars={[","]}
    />
  );
}
