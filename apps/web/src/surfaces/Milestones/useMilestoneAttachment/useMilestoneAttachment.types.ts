import type {
  MilestoneDetail,
  SetMilestoneItemsRequest,
} from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { MilestoneAttachmentEntry } from "../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
/** Picker identity and optional current selected-detail authority. */
export type MilestoneAttachmentOptions = {
  detail: MilestoneDetail;
  viewer: Viewer;
  source: "span" | "archive";
  hasUsableAuthority?: boolean;
};
/** Delta picker state, retaining local intent across filters and failures. */
export type MilestoneAttachment = {
  entries: MilestoneAttachmentEntry[];
  chosenCount: number;
  attachCount: number;
  detachCount: number;
  toggle: (itemId: string) => void;
  save: () => void;
  isPending: boolean;
  error: string | undefined;
  selection: TimelineSelection;
  onSelectionChange: (selection: TimelineSelection) => void;
  isReading: boolean;
  retryReads: () => void;
  hasMore: boolean;
  loadMore: () => void;
  savedDetail: MilestoneDetail | undefined;
  savedCounts: { attachedCount: number; detachedCount: number } | undefined;
};
/** Submission snapshot, including every explicitly changed identity. */
export type AttachmentSubmission = {
  delta: SetMilestoneItemsRequest;
  chosen: Map<string, boolean>;
  baseline: Map<string, boolean>;
};
