import { TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { DirectoryPerson, TagCount } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { TypeaheadRow } from "@/surfaces/Timeline/FilterSheet/TypeaheadRow";
import { ICON_PROPS } from "@/system/icons";

type Props = {
  typed: string;
  onTyped: (value: string) => void;
  search: string;
  tags: readonly TagCount[];
  people: readonly DirectoryPerson[];
  selection: TimelineSelection;
  onToggle: (dimension: "tags" | "people", id: string) => void;
};

/**
 * The free-text field, and the type-ahead row it reveals once there is
 * something typed.
 */
export function SearchField({
  typed,
  onTyped,
  search,
  tags,
  people,
  selection,
  onToggle,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <TextInput
        label="Words in a tag or a name"
        placeholder="hospital, Abuela, first steps"
        leftSection={<IconSearch {...ICON_PROPS} />}
        value={typed}
        onChange={(event) => {
          onTyped(event.currentTarget.value);
        }}
      />
      {search === "" ? null : (
        <TypeaheadRow
          tags={tags}
          people={people}
          selection={selection}
          onToggle={onToggle}
        />
      )}
    </>
  );
}
