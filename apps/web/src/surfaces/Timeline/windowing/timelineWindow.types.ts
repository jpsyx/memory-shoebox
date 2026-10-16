import type { RefObject } from "react";
import type {
  BurstFrameRef,
  ItemSummary,
  TimelineDay,
} from "@memory-shoebox/shared";

/** Compact position with the server-issued cursor of its containing page. */
export type TimelineAnchor = {
  capturedOn: string;
  itemId?: string;
  burstId?: string;
  offsetPx: number;
  pageCursor: string | undefined;
};

/** One measurable grid row, occasion header, or intrinsic-width burst line. */
export type TimelineRenderRow = {
  key: string;
  day: TimelineDay;
  itemIds: readonly string[];
  kind: "header" | "media";
  seedBase: number;
  items: readonly ItemSummary[];
  burstId?: string;
  frames?: readonly BurstFrameRef[];
  frameOffset?: number;
  isFanHeader?: boolean;
  reservedHeight?: number;
  isLast?: boolean;
};

/**
 * Compact expansion survives frame eviction without retaining media metadata.
 */
export type TimelineExpansion = { height: number };

/**
 * A member-owned view holds scalar positions and at most twenty expanded IDs.
 */
export type TimelineViewMemory = {
  anchor?: TimelineAnchor;
  expanded: Map<string, TimelineExpansion>;
};

/** Geometry and exact-page inputs for one committed timeline window. */
export type TimelineWindowOptions = {
  rows: readonly TimelineRenderRow[];
  viewKey: string;
  focusedItemId?: string;
  element: RefObject<HTMLElement | null>;
  tileWidth: number;
  isMobile: boolean;
  viewportWidth?: number;
  pageCursors?: ReadonlyMap<string, string | undefined>;
  recoverPage?: (anchor: TimelineAnchor) => Promise<void>;
  restoreBurst?: (
    burstId: string,
  ) => Promise<readonly BurstFrameRef[] | undefined>;
};
