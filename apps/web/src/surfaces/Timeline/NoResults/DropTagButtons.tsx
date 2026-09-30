import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { TagFacet } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";

type Props = {
  tags: readonly TagFacet[];
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
};

/** One button per chosen tag, each dropping just that one. */
export function DropTagButtons({
  tags,
  selection,
  onChange,
}: Readonly<Props>): ReactNode {
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
