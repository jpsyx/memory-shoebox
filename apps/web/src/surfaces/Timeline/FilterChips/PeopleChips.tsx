import { PersonIdentityLabel } from "@/system/personLabel/PersonIdentityLabel";
import { personLabel } from "@/system/personLabel/personLabel";
import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type {
  TimelineSelection,
  TimelineSelectionUpdate,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import { Chip } from "@/system/Chip/Chip";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (update: TimelineSelectionUpdate) => void;
};

/** One chip per person in the selection, each removing only itself. */
export function PeopleChips({
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  return selection.people.map((personId) => {
    const person = facets?.people.find((facet) => {
      return facet.person.personId === personId;
    })?.person;
    const name = person ? personLabel(person) : "Loading person...";
    return (
      <Chip
        key={personId}
        onPanel
        removeLabel={`Stop filtering by ${name}`}
        onRemove={() => {
          onChange((current) => {
            return {
              ...current,
              people: current.people.filter((entry) => {
                return entry !== personId;
              }),
            };
          });
        }}
      >
        {person ? <PersonIdentityLabel person={person} /> : name}
      </Chip>
    );
  });
}
