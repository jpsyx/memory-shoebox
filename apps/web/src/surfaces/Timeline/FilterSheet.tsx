import { Stack, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type {
  DirectoryPerson,
  FilterFacetsResponse,
  PersonFacet,
  TagCount,
  TagFacet,
} from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection";
import { isSelectionActive } from "@/api/timeline/selection";
import {
  peopleQueryOptions,
  tagsQueryOptions,
} from "@/api/vocabularies/vocabularies";
import { Chip } from "@/system/Chip/Chip";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { ICON_PROPS } from "@/system/icons";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
};

/** One chip's shape, once a tag facet or a person facet is boiled down to it. */
type FacetChipData = {
  id: string;
  name: string;
  isSelected: boolean;
  narrowedCount: number | null;
};

/** A tag facet as the shape `_facetChipRow` draws. */
function _tagFacetToChip(facet: Readonly<TagFacet>): FacetChipData {
  return {
    id: facet.tag.tagId,
    name: facet.tag.name,
    isSelected: facet.isSelected,
    narrowedCount: facet.narrowedCount,
  };
}

/** A person facet as the shape `_facetChipRow` draws. */
function _personFacetToChip(facet: Readonly<PersonFacet>): FacetChipData {
  return {
    id: facet.person.personId,
    name: facet.person.displayName,
    isSelected: facet.isSelected,
    narrowedCount: facet.narrowedCount,
  };
}

/**
 * One row of facet chips: "Who is in it" or the tags, drawn identically.
 *
 * **The counts narrow.** Each number is what adding that chip to the current
 * selection would leave, not what the chip is worth alone, and a zero stays
 * on the row, quiet, rather than disappearing: a row that reshuffles under a
 * finger is worse than a row with a dead chip in it, and `0` is itself the
 * answer to "is there anything from the beach with Abuela in it".
 */
function _facetChipRow(options: {
  chips: readonly FacetChipData[];
  onToggle: (id: string) => void;
}): ReactNode {
  const { chips, onToggle } = options;
  return (
    <ChipRow>
      {chips.map((chip) => {
        const shown = chip.narrowedCount;
        return (
          <Chip
            key={chip.id}
            active={chip.isSelected}
            quiet={shown === 0}
            onClick={() => {
              onToggle(chip.id);
            }}
          >
            {chip.name}
            {shown === null ? null : (
              <>
                {" "}
                <span className={classes.tabular}>
                  {shown.toLocaleString("en-GB")}
                </span>
              </>
            )}
          </Chip>
        );
      })}
    </ChipRow>
  );
}

/**
 * One type-ahead suggestion: a tag or a person, matched by what is typed.
 *
 * A press here fires `onToggle` immediately, never through the field's own
 * debounce: a press is a deliberate act and has to feel like one.
 */
function _typeaheadChip(options: {
  id: string;
  name: string;
  itemCount: number;
  active: boolean;
  onToggle: () => void;
}): ReactNode {
  const { id, name, itemCount, active, onToggle } = options;
  return (
    <Chip key={id} active={active} onClick={onToggle}>
      {name}{" "}
      <span className={classes.tabular}>
        {itemCount.toLocaleString("en-GB")}
      </span>
    </Chip>
  );
}

/** The type-ahead's own row: up to six matching tags, then up to six people. */
function _typeaheadRow(options: {
  tags: readonly TagCount[];
  people: readonly DirectoryPerson[];
  selection: TimelineSelection;
  onToggle: (dimension: "tags" | "people", id: string) => void;
}): ReactNode {
  const { tags, people, selection, onToggle } = options;
  return (
    <ChipRow>
      {tags.slice(0, 6).map((entry) => {
        return _typeaheadChip({
          id: entry.tag.tagId,
          name: entry.tag.name,
          itemCount: entry.itemCount,
          active: selection.tags.includes(entry.tag.tagId),
          onToggle: () => {
            onToggle("tags", entry.tag.tagId);
          },
        });
      })}
      {people.slice(0, 6).map((entry) => {
        return _typeaheadChip({
          id: entry.person.personId,
          name: entry.person.displayName,
          itemCount: entry.itemCount,
          active: selection.people.includes(entry.person.personId),
          onToggle: () => {
            onToggle("people", entry.person.personId);
          },
        });
      })}
    </ChipRow>
  );
}

/**
 * The "When" section: two native date inputs and the capture-date note.
 *
 * Native inputs rather than an invented calendar, because the audience skews
 * older and a native affordance beats a discovered one. Each change fires
 * immediately, exactly like a chip press.
 */
function _dateFields(options: {
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { selection, onChange } = options;
  return (
    <Stack gap="xs">
      <LabelText component="h3">When</LabelText>
      <ChipRow>
        <TextInput
          type="date"
          label="From"
          value={selection.from ?? ""}
          onChange={(event) => {
            onChange({
              ...selection,
              from:
                event.currentTarget.value === ""
                  ? undefined
                  : event.currentTarget.value,
            });
          }}
        />
        <TextInput
          type="date"
          label="Until"
          value={selection.until ?? ""}
          onChange={(event) => {
            onChange({
              ...selection,
              until:
                event.currentTarget.value === ""
                  ? undefined
                  : event.currentTarget.value,
            });
          }}
        />
      </ChipRow>
      <Prose>
        Dates are capture dates, not upload dates. A photograph taken in 2019
        and put up last week sits in 2019, where you would look for it.
      </Prose>
    </Stack>
  );
}

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
function useTypeahead(): TypeaheadState {
  const [typed, setTyped] = useState("");
  const [search] = useDebouncedValue(typed, 250);
  const tags = useQuery({
    ...tagsQueryOptions(search),
    enabled: search !== "",
  });
  const people = useQuery({
    ...peopleQueryOptions(search),
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
 * The free-text field, and the type-ahead row it reveals once there is
 * something typed.
 */
function _searchField(options: {
  typed: string;
  onTyped: (value: string) => void;
  search: string;
  tags: readonly TagCount[];
  people: readonly DirectoryPerson[];
  selection: TimelineSelection;
  onToggle: (dimension: "tags" | "people", id: string) => void;
}): ReactNode {
  const { typed, onTyped, search, tags, people, selection, onToggle } = options;
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
      {search === ""
        ? null
        : _typeaheadRow({ tags, people, selection, onToggle })}
    </>
  );
}

/** The "Who is in it" section: its facet row, plus the explanation once. */
function _peopleFacetSection(options: {
  facets: readonly PersonFacet[];
  isActive: boolean;
  onToggle: (id: string) => void;
}): ReactNode {
  const { facets, isActive, onToggle } = options;
  return (
    <Stack gap="xs">
      <LabelText component="h3">Who is in it</LabelText>
      {_facetChipRow({ chips: facets.map(_personFacetToChip), onToggle })}
      {isActive ? (
        <Prose>
          Each number is what you would be left with after adding that one, not
          what it is worth on its own. So a nought is visible before you press
          it rather than after.
        </Prose>
      ) : null}
    </Stack>
  );
}

/** The "Tags" section: its own facet row, drawn the same way. */
function _tagsFacetSection(options: {
  facets: readonly TagFacet[];
  onToggle: (id: string) => void;
}): ReactNode {
  const { facets, onToggle } = options;
  return (
    <Stack gap="xs">
      <LabelText component="h3">Tags</LabelText>
      {_facetChipRow({ chips: facets.map(_tagFacetToChip), onToggle })}
    </Stack>
  );
}

/**
 * Builds the one toggle every chip and suggestion on the sheet calls.
 *
 * One function rather than one per dimension, because a tag and a person
 * toggle the exact same way: add the id if it is missing, drop it if not.
 */
function _makeToggleSelection(
  selection: Readonly<TimelineSelection>,
  onChange: (selection: TimelineSelection) => void,
): (dimension: "tags" | "people", id: string) => void {
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
 * **The facet counts narrow** (see `_facetChipRow`). The free-text field
 * debounces at 250ms on the trailing edge; a chip press and a date change
 * fire immediately, because a press is a deliberate act and has to feel like
 * one.
 */
export function FilterSheet({
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  const { typed, onTyped, search, tags, people } = useTypeahead();
  const isActive = isSelectionActive(selection);
  const toggleSelection = _makeToggleSelection(selection, onChange);

  return (
    <Sheet wide label="Find something">
      <Stack gap="md">
        <LabelText component="h2">Find something</LabelText>
        {_searchField({
          typed,
          onTyped,
          search,
          tags,
          people,
          selection,
          onToggle: toggleSelection,
        })}
        {_peopleFacetSection({
          facets: facets?.people ?? [],
          isActive,
          onToggle: (id) => {
            toggleSelection("people", id);
          },
        })}
        {_tagsFacetSection({
          facets: facets?.tags ?? [],
          onToggle: (id) => {
            toggleSelection("tags", id);
          },
        })}
        {_dateFields({ selection, onChange })}
      </Stack>
    </Sheet>
  );
}
