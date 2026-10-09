import { Combobox, Pill, PillsInput } from "@mantine/core";
import { useId, type ComponentProps, type ReactNode } from "react";
import type { PeopleField } from "./PeopleField";
import type { AnyoneFieldController } from "./useAnyoneField";
import { PersonPills } from "./PersonPills";
import classes from "@/theme/components.module.css";

type Props = Pick<
  ComponentProps<typeof PeopleField>,
  | "label"
  | "description"
  | "placeholder"
  | "autoFocus"
  | "data-autofocus"
  | "value"
  | "onChange"
  | "isManaging"
  | "onRemovePerson"
> & { field: AnyoneFieldController };
const INPUT_CLASSES = {
  root: classes.inputWrapperRoot,
  label: classes.inputLabel,
  description: classes.inputDescription,
  input: `${classes.inputField} ${classes.tagsField}`,
};

function _openDropdown(
  options: Readonly<{ field: AnyoneFieldController; isManaging: boolean }>,
): void {
  if (!options.isManaging) {
    options.field.combobox.openDropdown();
  }
}

/** The visible pills and editable search text share Mantine's input shell. */
export function AnyoneFieldInput({
  field,
  value,
  onChange,
  onRemovePerson,
  isManaging = false,
  autoFocus,
  "data-autofocus": modalAutoFocus,
  placeholder,
  label,
  description,
}: Readonly<Props>): ReactNode {
  const id = useId();
  const openDropdown = () => {
    _openDropdown({ field, isManaging });
  };
  return (
    <Combobox.DropdownTarget>
      <PillsInput
        label={label}
        description={description}
        id={id}
        classNames={INPUT_CLASSES}
        onClick={openDropdown}
      >
        <Pill.Group className={classes.tagsPillsList}>
          <PersonPills
            value={value}
            onChange={onChange}
            onRemovePerson={onRemovePerson}
            disabled={isManaging}
          />
          <Combobox.EventsTarget withExpandedAttribute>
            <PillsInput.Field
              id={id}
              autoFocus={autoFocus}
              data-autofocus={modalAutoFocus}
              placeholder={placeholder}
              className={classes.tagsTypeField}
              value={field.search}
              disabled={isManaging}
              onFocus={openDropdown}
              onChange={(event) => {
                field.setSearch(event.currentTarget.value);
                field.combobox.resetSelectedOption();
                openDropdown();
              }}
              onKeyDown={field.onKeyDown}
            />
          </Combobox.EventsTarget>
        </Pill.Group>
      </PillsInput>
    </Combobox.DropdownTarget>
  );
}
