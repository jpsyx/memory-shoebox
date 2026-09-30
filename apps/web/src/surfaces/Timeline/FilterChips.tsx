import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { Chip } from "@/system/Chip/Chip";
import { dateRangeLabel, dayLabel } from "@/system/labelHelpers/labelHelpers";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
};

/** A tag's name, falling back to its id while the facets are in flight. */
function _getTagNameFromFacets(options: {
  facets: FilterFacetsResponse | undefined;
  tagId: string;
}): string {
  const { facets, tagId } = options;
  return (
    facets?.tags.find((facet) => {
      return facet.tag.tagId === tagId;
    })?.tag.name ?? tagId
  );
}

/** A person's name, falling back to their id for the same reason. */
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
function _peopleChips(options: {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { selection, facets, onChange } = options;
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

/** One chip per tag in the selection, each removing only itself. */
function _tagChips(options: {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { selection, facets, onChange } = options;
  return selection.tags.map((tagId) => {
    const name = _getTagNameFromFacets({ facets, tagId });
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
  });
}

/** What one date chip reads, whether one end is set or both. */
function _dateChipLabel(selection: TimelineSelection): string {
  if (selection.from === undefined) {
    return `Until ${dayLabel(selection.until ?? "")}`;
  }
  if (selection.until === undefined) {
    return `From ${dayLabel(selection.from)}`;
  }
  return dateRangeLabel({ from: selection.from, until: selection.until });
}

/**
 * The dates as one chip rather than two.
 *
 * "1 Sep to 30 Sep" is one decision somebody made, and taking half of it off
 * is not something anybody means.
 */
function _dateChip(options: {
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { selection, onChange } = options;
  if (selection.from === undefined && selection.until === undefined) {
    return null;
  }
  return (
    <Chip
      onPanel
      removeLabel="Clear the dates"
      onRemove={() => {
        onChange({ ...selection, from: undefined, until: undefined });
      }}
    >
      {_dateChipLabel(selection)}
    </Chip>
  );
}

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
  return (
    <>
      {_peopleChips({ selection, facets, onChange })}
      {_tagChips({ selection, facets, onChange })}
      {_dateChip({ selection, onChange })}
    </>
  );
}
