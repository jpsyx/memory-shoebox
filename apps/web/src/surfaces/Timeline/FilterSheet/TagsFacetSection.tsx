import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { TagFacet } from "@memory-shoebox/shared";
import {
  FacetChipRow,
  type FacetChipData,
} from "@/surfaces/Timeline/FilterSheet/FacetChipRow";
import { LabelText } from "@/system/typography/LabelText";

type Props = {
  facets: readonly TagFacet[];
  onToggle: (id: string) => void;
};

/** A tag facet as the shape `FacetChipRow` draws. */
function _tagFacetToChip(facet: Readonly<TagFacet>): FacetChipData {
  return {
    id: facet.tag.tagId,
    name: facet.tag.name,
    isSelected: facet.isSelected,
    // Null on the wire, because JSON has no `undefined`, and absent here.
    narrowedCount: facet.narrowedCount ?? undefined,
  };
}

/** The "Tags" section: its own facet row, drawn the same way. */
export function TagsFacetSection({
  facets,
  onToggle,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="xs">
      <LabelText component="h3">Tags</LabelText>
      <FacetChipRow chips={facets.map(_tagFacetToChip)} onToggle={onToggle} />
    </Stack>
  );
}
