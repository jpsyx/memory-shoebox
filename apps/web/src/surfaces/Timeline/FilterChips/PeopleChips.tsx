import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { Chip } from "@/system/Chip/Chip";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
};

/** A person's name, falling back to their id while the facets are in flight. */
function _getPersonNameFromFacets(options: {
  facets: FilterFacetsResponse | undefined;
  personId: string;
}): string {
  const { facets, personId } = options;
  return (
    facets?.people.find((facet) => {
      return facet.person.personId === personId;
    })?.person.displayName ?? personId
  );
}

/** One chip per person in the selection, each removing only itself. */
export function PeopleChips({
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  return selection.people.map((personId) => {
    const name = _getPersonNameFromFacets({ facets, personId });
    return (
      <Chip
        key={personId}
        onPanel
        removeLabel={`Stop filtering by ${name}`}
        onRemove={() => {
          onChange({
            ...selection,
            people: selection.people.filter((entry) => {
              return entry !== personId;
            }),
          });
        }}
      >
        {name}
      </Chip>
    );
  });
}
