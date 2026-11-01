import { Combobox, UnstyledButton } from "@mantine/core";
import type { MemberRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MemberAvatar } from "../MemberAvatar/MemberAvatar";
import classes from "./CommentTagInputField.module.css";
type Props = {
  members: readonly MemberRef[];
  isLoading: boolean;
  isError: boolean;
  query: string;
  onRetry: () => void;
};
/** The eligible directory, with no membership status or invitation actions. */
export function CommentTagPicker(props: Readonly<Props>): ReactNode {
  const { members, isLoading, isError, query, onRetry } = props;
  return (
    <Combobox.Dropdown
      className={classes.picker}
      onPointerDown={(event) => {
        return event.preventDefault();
      }}
    >
      <Combobox.Options aria-label="Members to tag" className={classes.options}>
        {isLoading ? (
          <Combobox.Empty>Finding members...</Combobox.Empty>
        ) : isError ? (
          <Combobox.Empty>
            Couldn't load members.{" "}
            <UnstyledButton onClick={onRetry}>Retry</UnstyledButton>
          </Combobox.Empty>
        ) : members.length === 0 ? (
          <Combobox.Empty>
            {query === ""
              ? "No members available to tag here."
              : "No matching members."}
          </Combobox.Empty>
        ) : (
          members.map((member) => {
            return (
              <Combobox.Option
                className={classes.option}
                key={member.memberId}
                value={member.memberId}
              >
                <MemberAvatar member={member} size={30} />
                <span>{member.displayName}</span>
              </Combobox.Option>
            );
          })
        )}
      </Combobox.Options>
    </Combobox.Dropdown>
  );
}
