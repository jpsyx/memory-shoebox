import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { PersonFacet } from "@memory-shoebox/shared";
import type {
  TimelineSelection,
  TimelineSelectionUpdate,
} from "@/api/timeline/selection/selection";
import { nameList } from "@/surfaces/Timeline/pileCopy/pileCopy";

type Props = {
  people: readonly PersonFacet[];
  selection: TimelineSelection;
  onChange: (update: TimelineSelectionUpdate) => void;
};

/** The one button that drops every chosen person at once. */
export function DropPeopleButton({
  people,
  onChange,
}: Readonly<Props>): ReactNode {
  return (
    <Button
      variant="panel"
      onClick={() => {
        onChange((current) => {
          return { ...current, people: [] };
        });
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
