import { Select as MantineSelect, type SelectProps } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";

type Props = Omit<SelectProps, "onChange" | "allowDeselect" | "clearable"> & {
  /** Receives the chosen option's value, including an explicit empty option. */
  onChange?: (value: string) => void;
};

/** A themed Mantine dropdown that keeps a choice selected until replaced. */
export function Select({ onChange, ...props }: Readonly<Props>): ReactNode {
  return (
    <MantineSelect
      rightSection={<IconChevronDown {...ICON_PROPS} />}
      rightSectionPointerEvents="none"
      checkIconPosition="right"
      nothingFoundMessage="No matching options"
      {...props}
      allowDeselect={false}
      clearable={false}
      onChange={(value) => {
        if (value !== null) {
          onChange?.(value);
        }
      }}
    />
  );
}
