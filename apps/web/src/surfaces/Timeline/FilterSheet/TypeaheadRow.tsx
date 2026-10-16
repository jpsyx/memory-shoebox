import type { ReactNode } from "react";
import type { DirectoryPerson, TagCount } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import { TypeaheadChip } from "@/surfaces/Timeline/FilterSheet/TypeaheadChip";
import { ChipRow } from "@/system/Chip/ChipRow";

type Props = {
  tags: readonly TagCount[];
  people: readonly DirectoryPerson[];
  selection: TimelineSelection;
  onToggle: (
    options: Readonly<{ dimension: "tags" | "people"; id: string }>,
  ) => void;
};

/** The type-ahead's own row: up to six matching tags, then up to six people. */
export function TypeaheadRow({
  tags,
  people,
  selection,
  onToggle,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      {tags.slice(0, 6).map((entry) => {
        return (
          <TypeaheadChip
            key={entry.tag.tagId}
            name={entry.tag.name}
            itemCount={entry.itemCount}
            active={selection.tags.includes(entry.tag.tagId)}
            onToggle={() => {
              onToggle({ dimension: "tags", id: entry.tag.tagId });
            }}
          />
        );
      })}
      {people.slice(0, 6).map((entry) => {
        return (
          <TypeaheadChip
            key={entry.person.personId}
            name={entry.person.displayName}
            itemCount={entry.itemCount}
            active={selection.people.includes(entry.person.personId)}
            onToggle={() => {
              onToggle({ dimension: "people", id: entry.person.personId });
            }}
          />
        );
      })}
    </ChipRow>
  );
}
