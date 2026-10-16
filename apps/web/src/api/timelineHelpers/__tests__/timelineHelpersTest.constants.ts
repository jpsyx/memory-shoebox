import type { TimelineSelection } from "@memory-shoebox/shared";

/** Unfiltered selection shared by the timeline URL and paging contracts. */
export const EMPTY_SELECTION = {
  tags: [],
  people: [],
  from: undefined,
  until: undefined,
} satisfies TimelineSelection;
