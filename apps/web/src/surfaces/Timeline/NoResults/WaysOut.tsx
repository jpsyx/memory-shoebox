import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { PersonFacet, TagFacet } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { DropDatesButton } from "@/surfaces/Timeline/NoResults/DropDatesButton";
import { DropPeopleButton } from "@/surfaces/Timeline/NoResults/DropPeopleButton";
import { DropTagButtons } from "@/surfaces/Timeline/NoResults/DropTagButtons";
import { ChipRow } from "@/system/Chip/ChipRow";

type Props = {
  people: readonly PersonFacet[];
  tags: readonly TagFacet[];
  hasDates: boolean;
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
  onClear: () => void;
};

/**
 * The row of ways out: drop one filter, or clear the lot.
 *
 * "Clear them all" is the strip's own clear-all under another name, so it
 * goes through the same handler and keeps `?at=` for the same reason.
 * Dropping one filter is a narrower edit and behaves like any other
 * selection change.
 */
export function WaysOut({
  people,
  tags,
  hasDates,
  selection,
  onChange,
  onClear,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      {hasDates ? (
        <DropDatesButton selection={selection} onChange={onChange} />
      ) : null}
      <DropTagButtons tags={tags} selection={selection} onChange={onChange} />
      {people.length === 0 ? null : (
        <DropPeopleButton
          people={people}
          selection={selection}
          onChange={onChange}
        />
      )}
      <Button variant="panel" onClick={onClear}>
        Clear them all
      </Button>
    </ChipRow>
  );
}
