import { useCombobox, type ComboboxStore } from "@mantine/core";
import { useState, type KeyboardEvent } from "react";
import { makeNameKeyFromName } from "./makeNameKeyFromName/makeNameKeyFromName";

type FieldOptions = {
  value: readonly string[];
  onChange: (names: readonly string[]) => void;
  isManaging?: boolean;
  onRemovePerson?: (index: number) => void;
  defaultSearchValue?: string;
  defaultDropdownOpened?: boolean;
};

/** Search and selection handlers shared by the input and dropdown. */
export type AnyoneFieldController = {
  combobox: ComboboxStore;
  search: string;
  setSearch: (search: string) => void;
  submit: (name: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

/** Explicit submission only; blur and paste never change accepted names. */
export function useAnyoneField(
  options: Readonly<FieldOptions>,
): AnyoneFieldController {
  const [search, setSearch] = useState(options.defaultSearchValue ?? "");
  const combobox = useCombobox({
    defaultOpened: options.defaultDropdownOpened,
    onDropdownClose: () => {
      combobox.resetSelectedOption();
    },
  });
  const submit = (name: string) => {
    if (options.isManaging) {
      return;
    }
    const trimmed = name.trim();
    if (
      trimmed &&
      !options.value.some((chosen) => {
        return makeNameKeyFromName(chosen) === makeNameKeyFromName(trimmed);
      })
    ) {
      options.onChange([...options.value, trimmed]);
    }
    setSearch("");
    combobox.resetSelectedOption();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter" && combobox.getSelectedOptionIndex() === -1) {
      event.preventDefault();
      submit(search);
    }
    if (event.key === "Backspace" && search.length === 0) {
      if (options.onRemovePerson) {
        options.onRemovePerson(options.value.length - 1);
      } else {
        options.onChange(options.value.slice(0, -1));
      }
    }
  };
  return { combobox, search, setSearch, submit, onKeyDown };
}
