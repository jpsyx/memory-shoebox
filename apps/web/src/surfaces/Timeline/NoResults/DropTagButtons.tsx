import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { TagFacet } from "@memory-shoebox/shared";
import type {
  TimelineSelection,
  TimelineSelectionUpdate,
} from "@/api/timeline/selection/selection";

type Props = {
  tags: readonly TagFacet[];
  selection: TimelineSelection;
  onChange: (update: TimelineSelectionUpdate) => void;
};

/** One button per chosen tag, each dropping just that one. */
export function DropTagButtons({ tags, onChange }: Readonly<Props>): ReactNode {
  return tags.map((facet) => {
    return (
      <Button
        key={facet.tag.tagId}
        variant="panel"
        onClick={() => {
          onChange((current) => {
            return {
              ...current,
              tags: current.tags.filter((entry) => {
                return entry !== facet.tag.tagId;
              }),
            };
          });
        }}
      >
        Drop {facet.tag.name}
      </Button>
    );
  });
}
