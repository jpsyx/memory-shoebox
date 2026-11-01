import { Combobox, Group } from "@mantine/core";
import type { ComponentProps, ReactNode } from "react";
import { PersonIdentityLabel } from "@/system/personLabel/PersonIdentityLabel";
import { personLabel } from "@/system/personLabel/personLabel";
import { PersonOptionActions } from "./PersonOptionActions";
import type { PeopleFieldPerson } from "./PeopleField";
import classes from "@/theme/components.module.css";
import fieldClasses from "./PeopleField.module.css";

type Props = Omit<ComponentProps<typeof PersonOptionActions>, "person"> & {
  person: PeopleFieldPerson;
  isChosen: boolean;
  optionValue: string;
};

/** A person and their own controls, even when another person has the same name. */
export function PersonNameOption({
  person,
  isChosen,
  optionValue,
  ...actions
}: Readonly<Props>): ReactNode {
  const hasActions =
    (person.canRename && actions.onRenamePerson) ||
    (person.canDelete && actions.onDeletePerson);
  if (isChosen && !hasActions) {
    return null;
  }
  return (
    <Group gap={0} wrap="nowrap" className={fieldClasses.optionRow}>
      <Combobox.Option
        value={optionValue}
        aria-label={personLabel(person)}
        disabled={isChosen || actions.isManaging}
        className={fieldClasses.optionName}
      >
        <span className={fieldClasses.name}>
          <PersonIdentityLabel person={person} />
        </span>
        <span className={classes.comboOptionCount}>
          {isChosen
            ? "tagged"
            : person.itemCount === 0
              ? "none yet"
              : person.itemCount.toLocaleString("en-GB")}
        </span>
      </Combobox.Option>
      <PersonOptionActions person={person} {...actions} />
    </Group>
  );
}
