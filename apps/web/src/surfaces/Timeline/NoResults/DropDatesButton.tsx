import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { TimelineSelection } from "@/api/timeline/selection/selection";

type Props = {
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
};

/** The one button that drops just the date range. */
export function DropDatesButton({
  selection,
  onChange,
}: Readonly<Props>): ReactNode {
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
