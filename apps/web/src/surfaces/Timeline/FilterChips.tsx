import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection";
import { Chip } from "@/system/Chip/Chip";
import { dateRangeLabel, dayLabel } from "@/system/labelHelpers/labelHelpers";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
};

/**
 * Every filter as a chip carrying its own way out.
 *
 * Nothing is ever on without being visible, which is the rule this strip
 * exists for. The dates are one chip rather than two, because "1 Sep to 30 Sep"
 * is one decision somebody made and taking half of it off is not something
 * anybody means.
 */
export function FilterChips({
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  const tagName = (tagId: string) => {
    return (
      facets?.tags.find((facet) => {
        return facet.tag.tagId === tagId;
      })?.tag.name ?? tagId
    );
  };
  const personName = (personId: string) => {
    return (
      facets?.people.find((facet) => {
        return facet.person.personId === personId;
      })?.person.displayName ?? personId
    );
  };

  return (
    <>
      {selection.people.map((personId) => {
        const name = personName(personId);
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
      })}
      {selection.tags.map((tagId) => {
        const name = tagName(tagId);
        return (
          <Chip
            key={tagId}
            onPanel
            removeLabel={`Stop filtering by ${name}`}
            onRemove={() => {
              onChange({
                ...selection,
                tags: selection.tags.filter((entry) => {
                  return entry !== tagId;
                }),
              });
            }}
          >
            {name}
          </Chip>
        );
      })}
      {selection.from === undefined && selection.until === undefined ? null : (
        <Chip
          onPanel
          removeLabel="Clear the dates"
          onRemove={() => {
            onChange({ ...selection, from: undefined, until: undefined });
          }}
        >
          {selection.from === undefined
            ? `Until ${dayLabel(selection.until ?? "")}`
            : selection.until === undefined
              ? `From ${dayLabel(selection.from)}`
              : dateRangeLabel({
                  from: selection.from,
                  until: selection.until,
                })}
        </Chip>
      )}
    </>
  );
}
