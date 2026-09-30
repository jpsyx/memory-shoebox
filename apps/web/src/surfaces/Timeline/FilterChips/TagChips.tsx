import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { Chip } from "@/system/Chip/Chip";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
};

/** A tag's name, falling back to its id while the facets are in flight. */
function _getTagNameFromFacets(options: {
  facets: FilterFacetsResponse | undefined;
  tagId: string;
}): string {
  const { facets, tagId } = options;
  return (
    facets?.tags.find((facet) => {
      return facet.tag.tagId === tagId;
    })?.tag.name ?? tagId
  );
}

/** One chip per tag in the selection, each removing only itself. */
export function TagChips({
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  return selection.tags.map((tagId) => {
    const name = _getTagNameFromFacets({ facets, tagId });
    return (
      <Chip
        key={tagId}
        onPanel
        removeLabel={`Stop filtering by ${name}`}
        onRemove={() => {
          onChange({
            ...selection,
            tags: selection.tags.filter((entry) => {
              return entry !== tagId;
            }),
          });
        }}
      >
        {name}
      </Chip>
    );
  });
}
