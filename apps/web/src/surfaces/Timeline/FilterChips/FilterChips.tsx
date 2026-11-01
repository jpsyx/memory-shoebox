import { useMemberCollection } from "@/api/memberCollections/memberCollections";
import { Chip } from "@/system/Chip/Chip";
import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type {
  TimelineSelection,
  TimelineSelectionUpdate,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import { DateChip } from "@/surfaces/Timeline/FilterChips/DateChip";
import { PeopleChips } from "@/surfaces/Timeline/FilterChips/PeopleChips";
import { TagChips } from "@/surfaces/Timeline/FilterChips/TagChips";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (update: TimelineSelectionUpdate) => void;
};

/**
 * Every filter as a chip carrying its own way out.
 *
 * Nothing is ever on without being visible, which is the rule this strip
 * exists for.
 */
export function FilterChips({
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  const identity = useMemberCollection(selection.member);
  const name = identity.data?.member?.displayName ?? "Member";
  return (
    <>
      {selection.member ? (
        <Chip
          onPanel
          removeLabel={`Stop filtering by ${name}`}
          onRemove={() => {
            onChange((current) => {
              return { ...current, member: undefined };
            });
          }}
        >
          {name}: uploaded or photo-tagged
        </Chip>
      ) : null}
      <PeopleChips selection={selection} facets={facets} onChange={onChange} />
      <TagChips selection={selection} facets={facets} onChange={onChange} />
      <DateChip selection={selection} onChange={onChange} />
    </>
  );
}
