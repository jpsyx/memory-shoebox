import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import { beforeEach } from "vitest";

import { respondWith } from "./timelineSurfaceTestHelpers";
/** Stable selected hospital-tag identity shared by pile filter cases. */
export const TAG_HOSPITAL_ID = "018f0000-0000-7000-8000-0000000e0001";
/**
 * Schema-valid selected-tag facets: null narrowed count, own count three and
 * matching result count.
 */
export const HOSPITAL_FACETS = {
  tags: [
    {
      tag: { tagId: TAG_HOSPITAL_ID, name: "hospital" },
      isSelected: true,
      // Null iff selected, and its own count non-null iff selected:
      // `tagFacetSchema` refuses the other way round, and a rejected facets
      // response leaves the chip labelled with a raw UUID.
      narrowedCount: null,
      ownCount: 3,
    },
  ],
  people: [],
  resultCount: 3,
} satisfies FilterFacetsResponse;
/** Installs the default timeline response fixture before each pile scenario. */
export function installTimelineSurfacePileTestLifecycle(): void {
  beforeEach(() => {
    respondWith();
  });
}
