import { MultiSelect, type ComboboxData } from "@mantine/core";
import type { ReactNode } from "react";
import type { MemberRef, PersonRef } from "@memory-shoebox/shared";
import type { MemberRole } from "@/system/memberRole";
import { AnyoneField } from "@/system/PeopleField/AnyoneField";
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

/** A member who can be chosen, with the role the option line shows if known. */
export type PeopleFieldMember = MemberRef & {
  readonly role?: MemberRole;
};

/**
 * A group, with the size its option line shows when the caller knows it.
 * Only an admin's group list carries the members to count.
 */
export type PeopleFieldGroup = {
  readonly groupId: string;
  readonly name: string;
  readonly memberCount?: number;
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
  /** Focus the field as it mounts, for one opened in place of a button. */
  autoFocus?: boolean;
};

const ROLE_WORD: Record<MemberRole, string> = {
  viewer: "Viewer",
  uploader: "Uploader",
  admin: "Admin",
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
    return group.memberCount === undefined ? "" : `${group.memberCount} people`;
  }
  const member = members.find((candidate) => {
    return candidate.memberId === value;
  });
  return member?.role === undefined ? "" : ROLE_WORD[member.role];
}

/** The options for the two modes whose options are records, groups first. */
function _recordOptionsFrom(
  options: Readonly<{
    mode: PeopleFieldMode;
    members: readonly PeopleFieldMember[];
    groups: readonly PeopleFieldGroup[];
  }>,
): ComboboxData {
  const memberOptions = options.members.map((member) => {
    return { value: member.memberId, label: member.displayName };
  });
  return options.mode === "members-and-groups"
    ? [
        {
          group: "Groups",
          items: options.groups.map((group) => {
            return { value: group.groupId, label: group.name };
          }),
        },
        { group: "People", items: memberOptions },
      ]
    : memberOptions;
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
  placeholder,
  value,
  onChange,
  mode = "members",
  members,
  groups = [],
  people = [],
  ...inputProps
}: Readonly<Props>): ReactNode {
  const openPlaceholder = value.length === 0 ? placeholder : undefined;

  if (mode === "anyone") {
    return (
      <AnyoneField
        {...inputProps}
        placeholder={openPlaceholder}
        value={value}
        onChange={onChange}
        people={people}
      />
    );
  }

  return (
    <MultiSelect
      {...inputProps}
      placeholder={openPlaceholder}
      data={_recordOptionsFrom({ mode, members, groups })}
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
    />
  );
}
