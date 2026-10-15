import type { BurstFrameRef, TimelineDay } from "@memory-shoebox/shared";

import { type RefObject } from "react";

import type {
  TimelineAnchor,
  TimelineExpansion,
} from "../windowing/timelineWindow.types";

import type { Stream } from "./DayStream";
/** Shared stream input and measurement ownership. */
export type Props = {
  days: readonly TimelineDay[];
  countLabel: string | undefined;
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  onOpenBurst: (burstId: string) => void;
  onOpenItem: (itemId: string) => void;
  /** Asks for the next page. A no-op once there is none. */
  onReachEnd: () => void;
  hasMore: boolean;
  isFetching?: boolean;
  hasPrevious?: boolean;
  onReachStart?: () => void;
  viewKey?: string;
  pageCursors?: ReadonlyMap<string, string | null>;
  recoverPage?: (anchor: TimelineAnchor) => Promise<void>;
  restoreBurst?: (
    burstId: string,
  ) => Promise<readonly BurstFrameRef[] | undefined>;
  expanded?: ReadonlyMap<string, TimelineExpansion>;
  onCollapseBurst?: (burstId: string) => void;
  focusRetirement?: number;
};
/** Shared stream input and measurement ownership. */
export type RootRef = RefObject<HTMLDivElement | null>;
/** Shared stream input and measurement ownership. */
export type StreamProps = {
  props: Readonly<Props>;
  stream: Stream;
  onCollapseBurst: (id: string) => void;
};
