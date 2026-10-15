import { beforeEach } from "vitest";

import { respondWith } from "./TimelineSurface.fixtures";
/** Shared scenario fixture. */
export const TAG_HOSPITAL_ID = "018f0000-0000-7000-8000-0000000e0001";
/** Shared scenario fixture. */
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
};
/** Registers the owned scenario setup and cleanup. */
export function installTimelineSurfacePileTestLifecycle(): void {
  beforeEach(() => {
    respondWith();
  });
}
