import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { PersonFacet } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { nameList } from "@/surfaces/Timeline/pileCopy/pileCopy";

type Props = {
  people: readonly PersonFacet[];
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
};

/** The one button that drops every chosen person at once. */
export function DropPeopleButton({
  people,
  selection,
  onChange,
}: Readonly<Props>): ReactNode {
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
