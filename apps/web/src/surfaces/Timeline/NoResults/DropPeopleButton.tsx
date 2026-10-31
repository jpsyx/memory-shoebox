import { personLabel } from "@/system/personLabel/personLabel";
import { PersonIdentityLabel } from "@/system/personLabel/PersonIdentityLabel";
import { Fragment } from "react";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { PersonFacet } from "@memory-shoebox/shared";
import type {
  TimelineSelection,
  TimelineSelectionUpdate,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
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
      aria-label={`Drop ${nameList(
        people.map((facet) => {
          return personLabel(facet.person);
        }),
      )}`}
      onClick={() => {
        onChange((current) => {
          return { ...current, people: [] };
        });
      }}
    >
      Drop{" "}
      {people.map((facet, index) => {
        return (
          <Fragment key={facet.person.personId}>
            {index === 0 ? "" : index === people.length - 1 ? " and " : ", "}
            <PersonIdentityLabel person={facet.person} />
          </Fragment>
        );
      })}
    </Button>
  );
}
