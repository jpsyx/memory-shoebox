import { Pill } from "@mantine/core";
import type { ReactNode } from "react";
import type { PersonChoice } from "./PeopleField";
import { personLabel } from "@/system/personLabel/personLabel";
import { PersonIdentityLabel } from "@/system/personLabel/PersonIdentityLabel";
import classes from "./PeopleField.module.css";

type Props = { person: PersonChoice; disabled: boolean; onRemove: () => void };

/** A removable photo identity with its full accessible membership label. */
export function PersonPill({
  person,
  disabled,
  onRemove,
}: Readonly<Props>): ReactNode {
  const label = personLabel({ ...person, personId: person.personId ?? "" });
  return (
    <Pill
      withRemoveButton
      className={classes.personPill}
      classNames={{
        label: classes.personPillLabel,
        remove: classes.personPillRemove,
      }}
      removeButtonProps={{
        "aria-label": `Untag ${label}`,
        "aria-hidden": false,
        tabIndex: 0,
        disabled,
      }}
      disabled={disabled}
      onRemove={onRemove}
    >
      <PersonIdentityLabel person={person} />
    </Pill>
  );
}
