import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { PersonFacet } from "@memory-shoebox/shared";
import {
  FacetChipRow,
  type FacetChipData,
} from "@/surfaces/Timeline/FilterSheet/FacetChipRow";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";

type Props = {
  facets: readonly PersonFacet[];
  isActive: boolean;
  onToggle: (id: string) => void;
};

/** A person facet as the shape `FacetChipRow` draws. */
function _personFacetToChip(facet: Readonly<PersonFacet>): FacetChipData {
  return {
    id: facet.person.personId,
    name: facet.person.displayName,
    isSelected: facet.isSelected,
    // Null on the wire, because JSON has no `undefined`, and absent here.
    narrowedCount: facet.narrowedCount ?? undefined,
  };
}

/** The "Who is in it" section: its facet row, plus the explanation once. */
export function PeopleFacetSection({
  facets,
  isActive,
  onToggle,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="xs">
      <LabelText component="h3">Who is in it</LabelText>
      <FacetChipRow
        chips={facets.map(_personFacetToChip)}
        onToggle={onToggle}
      />
      {isActive ? (
        <Prose>
          Each number is what you would be left with after adding that one, not
          what it is worth on its own. So a nought is visible before you press
          it rather than after.
        </Prose>
      ) : null}
    </Stack>
  );
}
