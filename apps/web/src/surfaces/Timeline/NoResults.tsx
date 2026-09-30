import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type {
  FilterFacetsResponse,
  PersonFacet,
  TagFacet,
} from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection";
import { nameList } from "@/surfaces/Timeline/pileCopy/pileCopy";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Ghosts } from "@/system/Pile/Ghosts";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
  /** Clearing the lot, which keeps the jump the same way the strip does. */
  onClear: () => void;
};

/**
 * The sentence explaining why nothing came back.
 *
 * The numbers are the `ownCount` the server sends on a selected chip and
 * nowhere else: "Elena is in 23 photographs and there are 141 tagged beach,
 * but none of them are the same ones".
 */
function _explanation(options: {
  people: readonly PersonFacet[];
  tags: readonly TagFacet[];
  hasDates: boolean;
}): ReactNode {
  const { people, tags, hasDates } = options;
  return (
    <Prose onPanel>
      {people.map((facet) => {
        return `${facet.person.displayName} is in ${facet.ownCount ?? 0} photographs. `;
      })}
      {tags.map((facet) => {
        return `There are ${facet.ownCount ?? 0} tagged ${facet.tag.name}. `;
      })}
      None of them are the same ones
      {hasDates ? ", and none are in that stretch of time" : ""}. Take one
      filter off and it will find something.
    </Prose>
  );
}

/** The one button that drops just the date range. */
function _dropDatesButton(options: {
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { selection, onChange } = options;
  return (
    <Button
      variant="panel"
      onClick={() => {
        onChange({ ...selection, from: undefined, until: undefined });
      }}
    >
      Drop the dates
    </Button>
  );
}

/** The one button that drops every chosen person at once. */
function _dropPeopleButton(options: {
  people: readonly PersonFacet[];
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { people, selection, onChange } = options;
  return (
    <Button
      variant="panel"
      onClick={() => {
        onChange({ ...selection, people: [] });
      }}
    >
      Drop{" "}
      {nameList(
        people.map((facet) => {
          return facet.person.displayName;
        }),
      )}
    </Button>
  );
}

/** One button per chosen tag, each dropping just that one. */
function _dropTagButtons(options: {
  tags: readonly TagFacet[];
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { tags, selection, onChange } = options;
  return tags.map((facet) => {
    return (
      <Button
        key={facet.tag.tagId}
        variant="panel"
        onClick={() => {
          onChange({
            ...selection,
            tags: selection.tags.filter((entry) => {
              return entry !== facet.tag.tagId;
            }),
          });
        }}
      >
        Drop {facet.tag.name}
      </Button>
    );
  });
}

/**
 * The row of ways out: drop one filter, or clear the lot.
 *
 * "Clear them all" is the strip's own clear-all under another name, so it
 * goes through the same handler and keeps `?at=` for the same reason.
 * Dropping one filter is a narrower edit and behaves like any other
 * selection change.
 */
function _waysOut(options: {
  people: readonly PersonFacet[];
  tags: readonly TagFacet[];
  hasDates: boolean;
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
  onClear: () => void;
}): ReactNode {
  const { people, tags, hasDates, selection, onChange, onClear } = options;
  return (
    <ChipRow>
      {hasDates ? _dropDatesButton({ selection, onChange }) : null}
      {_dropTagButtons({ tags, selection, onChange })}
      {people.length === 0
        ? null
        : _dropPeopleButton({ people, selection, onChange })}
      <Button variant="panel" onClick={onClear}>
        Clear them all
      </Button>
    </ChipRow>
  );
}

/**
 * Surface 6's `none` state.
 *
 * It says which filter is doing the excluding and offers to drop it. A bare
 * no-results page leaves people stuck, and the pile is still drawn under this
 * (empty), because removing it would make the page jump as a filter narrows
 * to nothing and back.
 */
export function NoResults({
  selection,
  facets,
  onChange,
  onClear,
}: Readonly<Props>): ReactNode {
  const chosenPeople = (facets?.people ?? []).filter((facet) => {
    return facet.isSelected;
  });
  const chosenTags = (facets?.tags ?? []).filter((facet) => {
    return facet.isSelected;
  });
  const hasDates =
    selection.from !== undefined || selection.until !== undefined;

  return (
    <Stack gap="md">
      <Lede>Nothing matches all of them.</Lede>
      {_explanation({ people: chosenPeople, tags: chosenTags, hasDates })}
      {_waysOut({
        people: chosenPeople,
        tags: chosenTags,
        hasDates,
        selection,
        onChange,
        onClear,
      })}
      <Ghosts />
    </Stack>
  );
}
