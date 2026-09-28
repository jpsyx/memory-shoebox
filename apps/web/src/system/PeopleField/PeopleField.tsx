import { MultiSelect, TagsInput } from "@mantine/core";
import type { ComboboxItem, OptionsFilter } from "@mantine/core";
import type { ReactNode } from "react";
import type { MemberRef, PersonRef } from "@memory-shoebox/shared";
import type { MemberRole } from "@/system/memberRole";
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

/** A member who can be chosen, with the role the option line shows. */
export type PeopleFieldMember = MemberRef & {
  readonly role: MemberRole;
};

/** A group, with the size its option line shows. No frozen DTO carries it. */
export type PeopleFieldGroup = {
  readonly groupId: string;
  readonly name: string;
  readonly memberCount: number;
};

/** A tagged person, with how many photographs the name is already on. */
export type PeopleFieldPerson = PersonRef & {
  readonly itemCount: number;
};

type Props = {
  label: string;
  description?: string;
  placeholder?: string;
  /** Member or group ids, except in `anyone` mode where these are names. */
  value: readonly string[];
  onChange: (nextValue: readonly string[]) => void;
  mode?: PeopleFieldMode;
  members: readonly PeopleFieldMember[];
  /** Required by `members-and-groups`, ignored by the other two modes. */
  groups?: readonly PeopleFieldGroup[];
  /** Required by `anyone`, ignored by the other two modes. */
  people?: readonly PeopleFieldPerson[];
  defaultSearchValue?: string;
  defaultDropdownOpened?: boolean;
};

const ROLE_WORD: Record<PeopleFieldMember["role"], string> = {
  viewer: "Viewer",
  uploader: "Uploader",
  admin: "Admin",
};

/** How many photographs a name is already on, or what it is instead. */
function _personDetail(options: {
  readonly name: string;
  readonly people: readonly PeopleFieldPerson[];
}): string {
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
 * Matches the typed text against known names, then adds the typed text
 * itself as an option when nothing already carries that exact name. That
 * option is how a name being invented gets offered back, so it can be
 * confirmed rather than only accepted blindly on Enter.
 */
const _anyoneFilter: OptionsFilter = ({ options, search, limit }) => {
  const searchLower = search.trim().toLowerCase();
  const items = options.filter((option): option is ComboboxItem<string> => {
    return !("group" in option);
  });
  const matches = items
    .filter((option) => {
      return option.label.toLowerCase().includes(searchLower);
    })
    .slice(0, limit);
  const hasExactMatch = matches.some((option) => {
    return option.label.toLowerCase() === searchLower;
  });
  const searchTrimmed = search.trim();
  return searchLower.length === 0 || hasExactMatch
    ? matches
    : [...matches, { value: searchTrimmed, label: searchTrimmed }];
};

/** Ids to secondary text, for the two modes whose options are records. */
function _optionDetail(options: {
  readonly value: string;
  readonly members: readonly PeopleFieldMember[];
  readonly groups: readonly PeopleFieldGroup[];
}): string {
  const { value, members, groups } = options;
  const group = groups.find((candidate) => {
    return candidate.groupId === value;
  });
  // Kept as an `if` rather than a ternary: the member lookup below only
  // needs to run when no group matched, and a ternary would force it to
  // run unconditionally.
  if (group) {
    return `${group.memberCount} people`;
  }
  const member = members.find((candidate) => {
    return candidate.memberId === value;
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
  members,
  groups = [],
  people = [],
  defaultSearchValue,
  defaultDropdownOpened,
}: Readonly<Props>): ReactNode {
  const openPlaceholder = value.length === 0 ? placeholder : undefined;

  if (mode === "anyone") {
    return (
      <TagsInput
        label={label}
        description={description}
        placeholder={openPlaceholder}
        data={people.map((person) => {
          return person.displayName;
        })}
        filter={_anyoneFilter}
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
        onChange={onChange}
        defaultSearchValue={defaultSearchValue}
        defaultDropdownOpened={defaultDropdownOpened}
        splitChars={[","]}
      />
    );
  }

  const memberOptions = members.map((member) => {
    return { value: member.memberId, label: member.displayName };
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
                items: groups.map((group) => {
                  return { value: group.groupId, label: group.name };
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
              {_optionDetail({ value: option.value, members, groups })}
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
