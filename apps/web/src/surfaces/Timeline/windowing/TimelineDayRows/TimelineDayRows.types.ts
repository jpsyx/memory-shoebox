import type { TimelineRenderRow } from "../timelineWindow.types";

/** Shared stream input and measurement ownership. */
export type Props = {
  row: TimelineRenderRow;
  countLabel?: string;
  isMobile?: boolean;
  onOpenBurst: (burstId: string) => void;
  onCollapseBurst?: (burstId: string) => void;
  onOpenItem: (itemId: string) => void;
};
/** Shared stream input and measurement ownership. */
export type WindowRowsProps = Omit<Props, "row"> & {
  rows: readonly TimelineRenderRow[];
  indexes: readonly number[];
  measurements: ReadonlyArray<import("@tanstack/react-virtual").VirtualItem>;
  visible: ReadonlySet<number>;
  measure: (element: HTMLElement | null) => void;
};
