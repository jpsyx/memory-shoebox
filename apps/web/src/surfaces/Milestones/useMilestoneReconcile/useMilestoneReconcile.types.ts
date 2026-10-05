import type {
  MilestoneDetail,
  ReconcileMilestoneRequest,
  ReconcileMilestoneResponse,
} from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
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
  action: "move" | "acknowledge" | "widen";
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
  strays: Array<import("@/system/MilestoneFix/MilestoneFix").StrayItem>;
  wideningSpan: { startsOn: string; endsOn: string } | undefined;
  refresh: () => Promise<{
    detail: MilestoneDetail;
    pages: import("@tanstack/react-query").InfiniteData<
      import("@memory-shoebox/shared").ListMilestoneMismatchesResponse,
      string | null
    >;
  }>;
  hasUsableReads: boolean;
  detailQueryOptions: ReturnType<
    typeof import("@/api/milestoneHelpers/milestonesQueryHelpers").milestoneDetailQueryOptions
  >;
  mismatchesOptions: ReturnType<
    typeof import("@/api/milestoneHelpers/milestoneItemsQueryHelpers").milestoneMismatchesInfiniteQueryOptions
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
