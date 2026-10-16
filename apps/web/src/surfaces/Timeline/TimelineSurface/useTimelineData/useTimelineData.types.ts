import type {
  TimelineAnchor,
  TimelineExpansion,
} from "../../windowing/timelineWindow.types";

import {
  type TimelineSearch,
  type TimelineSelection,
  type TimelineSelectionUpdate,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";

import type {
  BurstFrameRef,
  FilterFacetsResponse,
  MemberRole,
  RailDay,
  TimelineDay,
} from "@memory-shoebox/shared";

import { type RefCallback } from "react";

/** Timeline query results and controls consumed by the surface. */
export type TimelineData = {
  role: MemberRole;
  isEmptyArchive: boolean;
  isFiltered: boolean;
  hasOwnMain: boolean;
  /** Filtered, resolved, and empty: surface 6's dead end. */
  hasNoResults: boolean;
  filterCount: number;
  facets: FilterFacetsResponse | undefined;
  selection: TimelineSelection;
  countLabel: string | undefined;
  days: TimelineDay[];
  railDays: readonly RailDay[];
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  hasMore: boolean;
  isFetching: boolean;
  hasPrevious: boolean;
  viewKey: string;
  pageCursors: ReadonlyMap<string, string | undefined>;
  recoverPage: (anchor: TimelineAnchor) => Promise<void>;
  expanded: ReadonlyMap<string, TimelineExpansion>;
  onCollapseBurst: (burstId: string) => void;
  onSelectionChange: (update: TimelineSelectionUpdate) => void;
  /** Either "show everything" button, both of which keep the jump. */
  onClearFilters: () => void;
  onReachEnd: () => void;
  /** Guarded newer-page entry point for the measured start trigger. */
  onReachStart: () => void;
  onRestart: (at: string) => void;
  onOpenBurst: (burstId: string) => void;
  restoreBurst: (
    burstId: string,
  ) => Promise<readonly BurstFrameRef[] | undefined>;
  onClearBursts: () => void;
  /** A print or a fanned frame was pressed: the item viewer opens. */
  onOpenItem: (itemId: string) => void;
  /** The seen latch's own ref, put on `Archive`. */
  archiveRef: RefCallback<HTMLElement>;
};

/**
 * Query results and selection callbacks used to derive display data without
 * taking query, navigation or burst ownership.
 */
export type MakeTimelineDataOptions = {
  search: TimelineSearch;
  selection: TimelineSelection;
  role: MemberRole | undefined;
  days: TimelineDay[];
  railDays: readonly RailDay[];
  resultCount: number | undefined;
  facets: FilterFacetsResponse | undefined;
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  isStreamSuccess: boolean;
  hasNextPage: boolean;
  onReachEnd: () => void;
  onReachStart: () => void;
  onSelectionChange: (update: TimelineSelectionUpdate) => void;
  onClearFilters: () => void;
  onRestart: (at: string) => void;
};
