import { TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";

type Props = {
  q: string;
  onChange: (typed: string) => void;
};

/**
 * The field itself.
 *
 * Every change navigates immediately with `replace: true`, so typing narrows
 * the URL without leaving one history entry per keystroke behind somebody's
 * back button. The query the field's value drives is debounced separately,
 * in `PeopleSurface`.
 */
export function SearchField({ q, onChange }: Readonly<Props>): ReactNode {
  return (
    <TextInput
      label="Find somebody"
      placeholder="Start typing a name"
      leftSection={<IconSearch {...ICON_PROPS} />}
      value={q}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    />
  );
}
