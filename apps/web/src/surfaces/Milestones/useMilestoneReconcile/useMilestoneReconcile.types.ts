import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { StrayItem } from "@/system/MilestoneFix/MilestoneFix";
import type {
  MilestoneDetail,
  ReconcileMilestoneRequest,
  ReconcileMilestoneResponse,
} from "@memory-shoebox/shared";
import type { Action } from "./ReconcileAction";
/** Current routed identity and selected-detail read authority. */
export type ReconcileOptions = {
  detail: MilestoneDetail;
  viewer: Viewer;
  hasUsableAuthority?: boolean;
};
/** Immutable intent for one explicit action, retained through its preflight. */
export type ReconcileSubmission = {
  body: ReconcileMilestoneRequest | { startsOn: string; endsOn: string };
  itemIds: string[];
  milestone: MilestoneDetail["milestone"];
  action: Action;
};
/** Visible action errors and confirmed returned results. */
export type ReconcileState = {
  error: string | undefined;
  fieldErrors: Record<string, string>;
  failedTargets: Record<string, string>;
  raisedElsewhere: ReconcileMilestoneResponse["raisedElsewhere"];
  result: string | undefined;
};
/** Authoritative paged reads and safe continuation for one member/occasion. */
export type ReconcileReads = {
  queryClient: import("@tanstack/react-query").QueryClient;
  detail: MilestoneDetail;
  strays: Array<{ -readonly [Key in keyof StrayItem]: StrayItem[Key] }>;
  wideningSpan: { startsOn: string; endsOn: string } | undefined;
  refresh: () => Promise<{
    detail: MilestoneDetail;
    pages: import("@tanstack/react-query").InfiniteData<
      import("@memory-shoebox/shared").ListMilestoneMismatchesResponse,
      string | undefined
    >;
  }>;
  hasUsableReads: boolean;
  detailQueryOptions: ReturnType<
    typeof import("@/api/milestoneHelpers/milestonesQueryHelpers").makeMilestoneDetailQueryOptionsFromIdentity
  >;
  mismatchesOptions: ReturnType<
    typeof import("@/api/milestoneHelpers/milestoneItemsQueryHelpers").makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity
  >;
  isReading: boolean;
  hasReadError: boolean;
  hasMore: boolean;
  loadMore: () => void;
};
/** Mutation state for a distinct immutable reconciliation action. */
export type ReconcileActions = ReconcileState & {
  submit: (snapshot: ReconcileSubmission) => void;
  clearFieldError: (itemId: string) => void;
  isPending: boolean;
};
/** Controlled public reconciliation state with explicit date targets. */
export type ReconcileController = ReconcileReads &
  ReconcileActions & {
    targets: Record<string, string | undefined>;
    changeTarget: (options: { itemId: string; targetOn: string }) => void;
    move: () => void;
    acknowledge: () => void;
    widen: () => void;
  };
/** Immediate operation identity and lifetime guard. */
export type ReconcileGuard = {
  identity: string;
  isMounted: boolean;
  isLocked: boolean;
  hasWritten: boolean;
};
