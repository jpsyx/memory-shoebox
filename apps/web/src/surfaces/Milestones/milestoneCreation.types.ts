import type { MilestoneSelection } from "./useMilestoneForm/milestoneFormHelpers";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** An explicit selection retained across refresh for its originating member. */
    milestoneCreation?: {
      memberId: string;
      selection: MilestoneSelection;
    };
  }
}
