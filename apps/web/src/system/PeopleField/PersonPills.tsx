import { Pill } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./PeopleField.module.css";

type Props = {
  value: readonly string[];
  disabled: boolean;
  onRemovePerson?: (index: number) => void;
  onChange: (names: readonly string[]) => void;
};

/** Removing a pill only untags the person, never deletes their identity. */
export function PersonPills({
  value,
  disabled,
  onChange,
  onRemovePerson,
}: Readonly<Props>): ReactNode {
  return value.map((name, index) => {
    return (
      <Pill
        key={`${name}-${index}`}
        withRemoveButton
        className={classes.pill}
        removeButtonProps={{
          "aria-label": `Untag ${name}`,
          "aria-hidden": false,
          tabIndex: 0,
          disabled,
        }}
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
      >
        {name}
      </Pill>
    );
  });
}
