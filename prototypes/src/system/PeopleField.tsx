import { MultiSelect, TagsInput } from "@mantine/core";
import type { ReactNode } from "react";
import { GROUPS, MEMBERS, PEOPLE, type Role } from "@/data/fixtures";
import classes from "@/theme/components.module.css";

/**
 * What the field is for, which is the only thing that varies between the
 * places people are chosen.
 *
 * - `members` offers the people who hold an account and nothing else. Putting
 *   somebody in a group or naming them in a visibility rule only means
 *   anything if they can sign in, so inventing a name here would be an
 *   invitation the field cannot actually send.
 * - `members-and-groups` adds the named groups, because a visibility rule is
 *   routinely one word rather than nine names.
 * - `anyone` offers everybody the archive knows and accepts a name it has
 *   never heard of. That name becomes a person and nothing more: something
 *   photographs can point at, with no account and no way in.
 */
export type PeopleFieldMode = "members" | "members-and-groups" | "anyone";

const ROLE_WORD: Record<Role, string> = {
  viewer: "Viewer",
  uploader: "Uploader",
  admin: "Admin",
};

/** How many photographs a name is already on, or what it is instead. */
function countOfPerson(name: string): string {
  const person = PEOPLE.find((candidate) => {
    return candidate.name === name;
  });
  if (person === undefined) {
    return "new";
  }
  return person.itemCount === 0
    ? "none yet"
    : person.itemCount.toLocaleString("en-GB");
}

const ACTIVE_MEMBERS = MEMBERS.filter((member) => {
  return member.status === "active";
});

/** Ids to secondary text, for the two modes whose options are records. */
function describeOption(value: string): string {
  const group = GROUPS.find((candidate) => {
    return candidate.id === value;
  });
  if (group) {
    return `${group.memberIds.length} people`;
  }
  const member = MEMBERS.find((candidate) => {
    return candidate.id === value;
  });
  return member === undefined ? "" : ROLE_WORD[member.role];
}

/**
 * The one way people are chosen, anywhere in the product.
 *
 * Typing narrows the list, what has been chosen sits in the field as pills,
 * and the field grows downward rather than scrolling its own contents out of
 * sight. Every option carries what it is already worth, tabular and pushed
 * right, because a name on 412 photographs and a name on one are different
 * propositions.
 *
 * `mode` is the whole of the difference between its uses, and the part worth
 * getting right is whether a name the list has never heard of may be added.
 * That is a question about consequences rather than about convenience: on a
 * group or a visibility rule it would mean nothing, and on a people tag it is
 * the entire point.
 */
export function PeopleField({
  label,
  description,
  placeholder,
  value,
  onChange,
  mode = "members",
  defaultSearchValue,
  defaultDropdownOpened,
}: {
  readonly label: string;
  readonly description?: string;
  readonly placeholder?: string;
  /** Member or group ids, except in `anyone` mode where these are names. */
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly mode?: PeopleFieldMode;
  readonly defaultSearchValue?: string;
  readonly defaultDropdownOpened?: boolean;
}): ReactNode {
  const openPlaceholder = value.length === 0 ? placeholder : undefined;

  if (mode === "anyone") {
    return (
      <TagsInput
        label={label}
        description={description}
        placeholder={openPlaceholder}
        data={PEOPLE.map((person) => {
          return person.name;
        })}
        renderOption={({ option }) => {
          return (
            <>
              {option.value}
              <span className={classes.comboOptionCount}>
                {countOfPerson(option.value)}
              </span>
            </>
          );
        }}
        value={[...value]}
        onChange={onChange}
        defaultSearchValue={defaultSearchValue}
        defaultDropdownOpened={defaultDropdownOpened}
        splitChars={[","]}
      />
    );
  }

  const memberOptions = ACTIVE_MEMBERS.map((member) => {
    return { value: member.id, label: member.name };
  });

  return (
    <MultiSelect
      label={label}
      description={description}
      placeholder={openPlaceholder}
      data={
        mode === "members-and-groups"
          ? [
              {
                group: "Groups",
                items: GROUPS.map((group) => {
                  return { value: group.id, label: group.name };
                }),
              },
              { group: "People", items: memberOptions },
            ]
          : memberOptions
      }
      renderOption={({ option }) => {
        return (
          <>
            {option.label}
            <span className={classes.comboOptionCount}>
              {describeOption(option.value)}
            </span>
          </>
        );
      }}
      value={[...value]}
      onChange={onChange}
      defaultSearchValue={defaultSearchValue}
      defaultDropdownOpened={defaultDropdownOpened}
    />
  );
}
