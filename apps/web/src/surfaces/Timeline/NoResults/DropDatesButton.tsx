import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type {
  TimelineSelection,
  TimelineSelectionUpdate,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";

type Props = {
  selection: TimelineSelection;
  onChange: (update: TimelineSelectionUpdate) => void;
};

/** The one button that drops just the date range. */
export function DropDatesButton({ onChange }: Readonly<Props>): ReactNode {
  return (
    <Button
      variant="panel"
      onClick={() => {
        onChange((current) => {
          return { ...current, from: undefined, until: undefined };
        });
      }}
    >
      Drop the dates
    </Button>
  );
}
