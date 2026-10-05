import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { isSelectionActive } from "@/api/timeline/selection/selection";
import {
  makePeopleQueryOptionsFromSearchScope,
  makeTagsQueryOptionsFromSearchScope,
} from "@/api/vocabularies/vocabularies";
import { DateFields } from "@/surfaces/Timeline/FilterSheet/DateFields";
import { PeopleFacetSection } from "@/surfaces/Timeline/FilterSheet/PeopleFacetSection";
import { SearchField } from "@/surfaces/Timeline/FilterSheet/SearchField";
import { TagsFacetSection } from "@/surfaces/Timeline/FilterSheet/TagsFacetSection";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Stack } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import type {
  DirectoryPerson,
  FilterFacetsResponse,
  TagCount,
} from "@memory-shoebox/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
type Props = {
  memberId?: string;
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
};

/** What the type-ahead needs: the typed text, its debounced form, and both
 * vocabularies it asks for once the debounce settles. */
type TypeaheadState = {
  typed: string;
  onTyped: (value: string) => void;
  search: string;
  tags: readonly TagCount[];
  people: readonly DirectoryPerson[];
};

/**
 * The free-text field's own state, kept apart from `FilterSheet` so that
 * function stays a plain layout.
 *
 * Debounces at 250ms on the trailing edge and asks nothing of either
 * vocabulary until something is typed: a press is immediate, but typing is
 * not, and a query fired on every keystroke is the one this surface can least
 * afford to run that often.
 */
function useTypeahead(memberId?: string): TypeaheadState {
  const [typed, setTyped] = useState("");
  const [search] = useDebouncedValue(typed, 250);
  const tags = useQuery({
    ...makeTagsQueryOptionsFromSearchScope({ q: search, memberId }),
    enabled: search !== "",
  });
  const people = useQuery({
    ...makePeopleQueryOptionsFromSearchScope({ q: search, memberId }),
    enabled: search !== "",
  });
  return {
    typed,
    onTyped: setTyped,
    search,
    tags: tags.data?.tags ?? [],
    people: people.data?.people ?? [],
  };
}

/**
 * Builds the one toggle every chip and suggestion on the sheet calls.
 *
 * One function rather than one per dimension, because a tag and a person
 * toggle the exact same way: add the id if it is missing, drop it if not.
 */
function _makeToggleSelection(options: {
  selection: Readonly<TimelineSelection>;
  onChange: (selection: TimelineSelection) => void;
}): (dimension: "tags" | "people", id: string) => void {
  const { selection, onChange } = options;
  return (dimension, id) => {
    const current = selection[dimension];
    onChange({
      ...selection,
      [dimension]: current.includes(id)
        ? current.filter((entry) => {
            return entry !== id;
          })
        : [...current, id],
    });
  };
}

/**
 * Surface 6's controls: the words, the people, the tags and the dates.
 *
 * **The facet counts narrow** (see `FacetChipRow`). The free-text field
 * debounces at 250ms on the trailing edge; a chip press and a date change
 * fire immediately, because a press is a deliberate act and has to feel like
 * one.
 */
export function FilterSheet({
  memberId,
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  const { typed, onTyped, search, tags, people } = useTypeahead(memberId);
  const isActive = isSelectionActive(selection);
  const toggleSelection = _makeToggleSelection({ selection, onChange });

  return (
    <Sheet wide label="Find something">
      <Stack gap="md">
        <LabelText component="h2">Find something</LabelText>
        <SearchField
          typed={typed}
          onTyped={onTyped}
          search={search}
          tags={tags}
          people={people}
          selection={selection}
          onToggle={toggleSelection}
        />
        <PeopleFacetSection
          facets={facets?.people ?? []}
          isActive={isActive}
          onToggle={(id) => {
            toggleSelection("people", id);
          }}
        />
        <TagsFacetSection
          facets={facets?.tags ?? []}
          onToggle={(id) => {
            toggleSelection("tags", id);
          }}
        />
        <DateFields selection={selection} onChange={onChange} />
      </Stack>
    </Sheet>
  );
}
