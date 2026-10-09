import { Box, Combobox, ScrollArea } from "@mantine/core";
import type { ComponentProps, ReactNode } from "react";
import type { PeopleField } from "./PeopleField";
import { AnyoneFieldInput } from "./AnyoneFieldInput";
import { AnyoneFieldOptions } from "./AnyoneFieldOptions";
import { useAnyoneField } from "./useAnyoneField";
import classes from "@/theme/components.module.css";

type Props = Omit<
  ComponentProps<typeof PeopleField>,
  "mode" | "members" | "groups"
>;
const COMBOBOX_CLASSES = {
  dropdown: classes.comboDropdown,
  option: classes.comboOption,
  empty: classes.comboEmpty,
};

function _submitOption(
  options: Readonly<{
    props: Props;
    field: ReturnType<typeof useAnyoneField>;
    value: string;
  }>,
): void {
  const { props, field, value } = options;
  if (props.isManaging) {
    return;
  }
  const person = props.people?.find((candidate) => {
    return `person:${candidate.personId}` === value;
  });
  if (person && props.onSelectPerson) {
    props.onSelectPerson(person);
    field.setSearch("");
    field.combobox.resetSelectedOption();
  } else {
    field.submit(value);
  }
}

/** Names accepted by a click or Enter, with independent person actions. */
export function AnyoneField(props: Readonly<Props>): ReactNode {
  const field = useAnyoneField(props);
  const closeDropdown = () => {
    field.combobox.closeDropdown();
  };
  return (
    <Box
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeDropdown();
        }
      }}
    >
      <Combobox
        store={field.combobox}
        withinPortal={false}
        onOptionSubmit={(value) => {
          _submitOption({ props, field, value });
        }}
        classNames={COMBOBOX_CLASSES}
      >
        <AnyoneFieldInput {...props} field={field} />
        <Combobox.Dropdown>
          <ScrollArea.Autosize mah={280} type="auto">
            <AnyoneFieldOptions
              people={props.people ?? []}
              value={props.value}
              selectedPersonIds={props.selectedPersonIds}
              search={field.search}
              onRenamePerson={props.onRenamePerson}
              onDeletePerson={props.onDeletePerson}
              isManaging={props.isManaging ?? false}
              onAction={closeDropdown}
            />
          </ScrollArea.Autosize>
        </Combobox.Dropdown>
      </Combobox>
    </Box>
  );
}
